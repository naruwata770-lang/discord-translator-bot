# Phase 3実装計画: 通常テキストメッセージ形式への移行

## 概要

Phase 1（ゼロ幅スペース間隔変更）とPhase 2（Description統合型）の失敗を受け、**通常テキストメッセージ形式**に移行する。

Codexのレビュー結果に基づき、Embed形式を完全に廃止し、Discord標準の通常テキストメッセージを使用することで、iPhone 15 Pro MAXでのCJKテキスト表示問題を根本的に解決する。

---

## 背景

### Phase 1の失敗
- **実装**: ゼロ幅スペース間隔を15文字→10文字に変更
- **結果**: 失敗
- **原因**: Discord iOS アプリはEmbed Fieldではゼロ幅スペース（\u200B）を改行機会として認識しない

### Phase 2の失敗
- **実装**: Embed FieldをすべてDescriptionに統合
- **結果**: 短文は成功、長文は完全に失敗
- **原因**:
  - 原文だけで4096文字制限に達し、翻訳結果が表示されない
  - 切り詰めが発生すること自体が問題

### Codexのレビュー結果

**重要な指摘**:
1. Embedは本来サマリ向きのUI、長文全文表示には不向き
2. iOS版DiscordはEmbed内部の長文をラップせず省略表示する
3. **通常メッセージはCJKで自然に折り返される**（最重要）
4. Discord APIのベストプラクティスは「Embedは要約と付加情報」

**推奨**: Embed形式から脱却し、通常テキストメッセージを使用する

---

## Phase 3の解決策

### コンセプト

**1つの通常テキストメッセージに、原文+翻訳結果をすべて含める**

Embed形式を完全に廃止し、Discordが標準でサポートする通常テキストメッセージを使用することで:
- Discord iOSのEmbed制約から完全に解放
- CJKテキストが確実に自然に折り返される
- シンプルで保守しやすいコード

---

## メッセージフォーマット

### 通常ケース（2000文字以内）

```
💬 原文
ようやく刺激が止まり、つかの間の静寂が戻った部屋で、
フラヴィアは死体さながらぐったりと寝ていた。全身は汗でびしょ濡れ、
体液と蜜液でシーツは水溜まりのよう。

🇨🇳 中文
终于刺激停止了，短暂的寂静回到了房间，
弗拉维亿像尸体一样瘫软地躺着。全身汗湿淋漓，
体液和蜜液让床单像水洼一样。

🇺🇸 English
At last, the stimulation ceased, and in the brief silence
that returned to the room, Flavia lay sprawled like a corpse.
Her whole body was drenched in sweat, and the sheets were soaked
like puddles from bodily fluids and nectar.

🇯🇵 自動翻訳
```

### 長文ケース（2000文字超過、稀）

原文と翻訳結果の合計が2000文字を超える場合のみ、複数メッセージに分割:

```
[メッセージ1]
💬 原文
[原文テキスト前半...]

🇨🇳 中文
[中国語翻訳前半...]

[メッセージ2]
🇨🇳 中文（続き）
[中国語翻訳後半...]

🇺🇸 English
[英語翻訳全文...]

🇯🇵 自動翻訳
```

---

## アーキテクチャ変更

### Before (Phase 2)

```typescript
// Embed形式
const embed = new EmbedBuilder()
  .setDescription(`💬 原文\n${text}\n\n🇨🇳 中文\n${zh}...`);

await originalMessage.reply({ embeds: [embed] });
```

**問題**:
- 4096文字制限
- iOS Embedの折り返し問題
- 複雑なロジック（切り詰め、パディング等）

### After (Phase 3)

```typescript
// 通常テキストメッセージ
const message = `💬 原文\n${text}\n\n🇨🇳 中文\n${zh}\n\n🇺🇸 English\n${en}\n\n🇯🇵 自動翻訳`;

await originalMessage.reply({
  content: message,
  allowedMentions: { parse: [], repliedUser: false }
});
```

**改善**:
- 2000文字制限（より余裕がある）
- Discordが自動的に折り返し
- シンプルなロジック

---

## 実装の詳細

### 1. メッセージ構築ロジック

```typescript
private buildPlainTextMessage(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): string {
  const sourceLang = results[0]?.sourceLang || 'unknown';
  const cleanText = originalMessage.cleanContent || originalText;

  // 原文セクション
  let message = `💬 **原文**\n${cleanText}\n\n`;

  // 翻訳結果セクション（各言語ごと）
  for (const result of results) {
    if (result.status === 'success') {
      const flag = this.getLanguageFlag(result.targetLang);
      const langName = this.getLanguageName(result.targetLang);
      const sanitizedText = this.sanitizeMentions(result.translatedText);

      message += `${flag} **${langName}**\n${sanitizedText}\n\n`;
    } else {
      // エラーの場合
      const flag = this.getLanguageFlag(result.targetLang);
      const langName = this.getLanguageName(result.targetLang);
      message += `${flag} **${langName}**\n⚠️ 翻訳に失敗しました\n\n`;
    }
  }

  // フッター
  const sourceFlag = this.getLanguageFlag(sourceLang);
  message += `${sourceFlag} 自動翻訳`;

  return message;
}
```

### 2. メッセージ送信ロジック

```typescript
async sendMultiTranslation(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): Promise<void> {
  // エラーチェック（既存ロジック維持）
  const hasSuccess = results.some(r => r.status === 'success');
  const allInvalidInput = results.every(r =>
    r.status === 'error' && r.error?.code === 'INVALID_INPUT'
  );

  if (allInvalidInput) {
    return; // 静かにスキップ
  }

  if (!hasSuccess) {
    // エラーメッセージ送信
    await this.sendError(/* ... */);
    return;
  }

  // 通常テキストメッセージを構築
  const message = this.buildPlainTextMessage(results, originalMessage, originalText);

  // 2000文字チェック
  if (message.length <= 2000) {
    // 1メッセージで送信
    await originalMessage.reply({
      content: message,
      allowedMentions: { parse: [], repliedUser: false }
    });
  } else {
    // 複数メッセージに分割（稀なケース）
    await this.sendSplitMessages(results, originalMessage, originalText);
  }
}
```

### 3. 長文分割ロジック（2000文字超過時）

```typescript
private async sendSplitMessages(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): Promise<void> {
  const sourceLang = results[0]?.sourceLang || 'unknown';
  const cleanText = originalMessage.cleanContent || originalText;
  const sourceFlag = this.getLanguageFlag(sourceLang);

  // 原文を送信
  const originalMsg = `💬 **原文**\n${cleanText}\n\n${sourceFlag} 自動翻訳`;
  if (originalMsg.length <= 2000) {
    await originalMessage.reply({
      content: originalMsg,
      allowedMentions: { parse: [], repliedUser: false }
    });
  } else {
    // 原文自体が2000文字超過（極めて稀）
    const chunks = this.splitText(cleanText, 1900);
    for (let i = 0; i < chunks.length; i++) {
      const content = i === 0
        ? `💬 **原文**\n${chunks[i]}`
        : `💬 **原文（続き）**\n${chunks[i]}`;

      if (i === 0) {
        await originalMessage.reply({
          content,
          allowedMentions: { parse: [], repliedUser: false }
        });
      } else {
        await originalMessage.channel.send(content);
      }
    }
  }

  // 各翻訳結果を送信
  for (const result of results) {
    if (result.status === 'success') {
      const flag = this.getLanguageFlag(result.targetLang);
      const langName = this.getLanguageName(result.targetLang);
      const sanitizedText = this.sanitizeMentions(result.translatedText);

      const translationMsg = `${flag} **${langName}**\n${sanitizedText}`;

      if (translationMsg.length <= 2000) {
        await originalMessage.channel.send(translationMsg);
      } else {
        // 翻訳結果が2000文字超過
        const chunks = this.splitText(sanitizedText, 1900);
        for (let i = 0; i < chunks.length; i++) {
          const content = i === 0
            ? `${flag} **${langName}**\n${chunks[i]}`
            : `${flag} **${langName}（続き）**\n${chunks[i]}`;
          await originalMessage.channel.send(content);
        }
      }
    }
  }
}

private splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? '\n' : '') + line;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      // 1行が長すぎる場合は強制分割
      if (line.length > maxLength) {
        let remaining = line;
        while (remaining.length > maxLength) {
          chunks.push(remaining.substring(0, maxLength));
          remaining = remaining.substring(maxLength);
        }
        currentChunk = remaining;
      } else {
        currentChunk = line;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}
```

---

## ゼロ幅スペースの扱い

### 仮説

**通常テキストメッセージではゼロ幅スペースは不要**

理由:
- Discordが通常テキストメッセージを自動的に折り返す
- Embed特有の制約がない
- CJKテキストが自然に改行される

### 検証方法

1. **まずゼロ幅スペースなしで実装**
2. iPhone 15 Pro MAXでテスト送信
3. CJKテキストが正しく折り返されているか確認
4. 問題があれば`addWordBreakOpportunities()`を適用

### コード方針

```typescript
// Phase 3初期実装: ゼロ幅スペースなし
const message = `💬 **原文**\n${cleanText}\n\n...`;

// 問題があれば追加
// const message = `💬 **原文**\n${this.addWordBreakOpportunities(cleanText, sourceLang)}\n\n...`;
```

---

## 削除されるコード

### メソッド削除
- `buildMultiEmbed()` - Embed構築（不要）
- `buildMultipleEmbeds()` - 複数Embed分割（不要）
- `isEmbedValid()` - サイズチェック（不要）
- `truncateField()` - Field切り詰め（不要）
- `ensureMinimumWidthForDescription()` - 幅確保（不要）

**Phase 2で既に削除済み**: `buildMultipleEmbeds()`, `isEmbedValid()`, `truncateField()`, `ensureMinimumWidthForDescription()`

### 新規作成
- `buildPlainTextMessage()` - 通常テキストメッセージ構築
- `sendSplitMessages()` - 2000文字超過時の分割送信
- `splitText()` - テキスト分割ユーティリティ

---

## テスト計画

### ユニットテスト

| テストケース | 原文 | 翻訳結果 | 期待される動作 |
|-------------|------|---------|---------------|
| 短文 | 50文字 | 各50文字 | 1メッセージ（約200文字） |
| 中文 | 500文字 | 各500文字 | 1メッセージ（約1600文字） |
| 長文 | 800文字 | 各800文字 | 分割判定（約2600文字→2メッセージ） |
| 超長文 | 1500文字 | 各1500文字 | 複数メッセージ分割 |
| エラー混在 | 100文字 | 1成功+1失敗 | エラー表示を含む1メッセージ |
| メンション | @everyone | 各50文字 | メンションがサニタイズされる |

### 統合テスト

1. **通常の2言語翻訳**
   - 日本語 → 中国語 + 英語
   - 中国語 → 日本語 + 英語

2. **長文テスト**
   - 各言語で1000文字以上
   - 2000文字制限の動作確認

3. **エラーハンドリング**
   - 片方の翻訳が失敗
   - 両方の翻訳が失敗

4. **特殊文字**
   - 絵文字混在
   - URL混在
   - メンション混在

5. **iPhone 15 Pro MAX表示確認**（手動）
   - CJKテキストが折り返されるか
   - 横スクロールが発生しないか
   - テキストが途切れないか

---

## リスク分析

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| 通常テキストでもCJKが折り返されない | 高 | 極低 | ゼロ幅スペース追加 |
| 2000文字超過が頻発 | 中 | 低 | 分割送信ロジックで対応 |
| 複数メッセージでチャンネル埋まる | 低 | 低 | 実用上問題なし |
| メッセージ送信順序が乱れる | 低 | 極低 | await で順次送信 |
| Discord APIレート制限 | 低 | 極低 | 既存のRateLimiter使用 |

---

## 成功基準

### 必須
- ✅ iPhone 15 Pro MAXで全てのCJKテキストが正しく表示される
- ✅ 横スクロールが発生しない
- ✅ テキストが途中で切れない
- ✅ 全ユニットテストが成功
- ✅ ビルドが成功

### 望ましい
- ✅ 2000文字以内で99%のケースをカバー（分割が稀）
- ✅ コード量が削減される
- ✅ 保守性が向上する
- ✅ ユーザーから「読みやすい」とフィードバック

---

## デプロイ計画

### ステップ
1. ✅ feature/fix-mobile-wrapping-phase3 ブランチ作成
2. ✅ buildPlainTextMessage() 実装
3. ✅ sendMultiTranslation() 書き換え
4. ✅ sendSplitMessages() 実装
5. ✅ 不要メソッド削除
6. ✅ テスト更新・実行
7. ✅ ローカルで動作確認
8. ✅ develop へマージ
9. ✅ Railway.app へデプロイ
10. ✅ iPhone 15 Pro MAXで実機確認

### コミットメッセージ
```
refactor: Embed形式を廃止して通常テキストメッセージに移行

## 問題
Phase 1/2ではEmbed形式にこだわったが、以下の問題が継続:
- Phase 1: Embed Fieldでゼロ幅スペースが認識されない
- Phase 2: Description統合型で長文が切り詰められる
- Codexレビュー: Embedは長文全文表示に不向き

## 根本原因
Discord iOS アプリのEmbed制約により、CJKテキストの折り返しが
安定しない。通常テキストメッセージを使用すべき。

## 解決策（Phase 3）
Embed形式を完全に廃止し、1つの通常テキストメッセージに
原文+翻訳結果をすべて含める。

## 実装内容
- buildPlainTextMessage(): 通常テキストメッセージ構築
- sendMultiTranslation(): テキストメッセージ送信型に書き換え
- sendSplitMessages(): 2000文字超過時の分割送信
- Embed関連メソッド削除: buildMultiEmbed()

## 期待される効果
- Discordが通常テキストを自動的に折り返す
- iPhone 15 Pro MAXでCJKテキストが確実に表示される
- シンプルで保守しやすいコード

Phase 3/3: 根本的解決（Embed形式からの完全脱却）
```

---

## ロールバック計画

### 条件
- iPhone 15 Pro MAXでCJKテキストが折り返されない
- 通常テキストメッセージでも表示問題が発生
- ユーザーから苦情

### 手順
```bash
# Phase 3を revert
git revert <phase3-commit-hash>

# Phase 2に戻す
git push origin develop

# Railway.appが自動デプロイ
```

**ロールバック時間**: 5分以内

---

## スケジュール

| タスク | 所要時間 | 担当 |
|--------|---------|------|
| ブランチ作成 | 5分 | Claude Code |
| buildPlainTextMessage() 実装 | 30分 | Claude Code |
| sendMultiTranslation() 書き換え | 30分 | Claude Code |
| sendSplitMessages() 実装 | 30分 | Claude Code |
| 不要メソッド削除 | 10分 | Claude Code |
| テスト更新・実行 | 30分 | Claude Code |
| ローカル動作確認 | 10分 | Claude Code |
| developマージ | 10分 | Claude Code |
| mainへPR・マージ | 10分 | Claude Code |
| Railway.appデプロイ | 5分 | 自動 |
| **iPhone実機確認** | **ユーザー** | **ユーザー** |

**合計**: 約3時間（実装〜デプロイまで）

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|---|---------|--------|
| 2025-10-27 | 1.0 | Phase 3計画書作成 | Claude Code |

---

**プロジェクトステータス**: Phase 3実装準備完了 🚀
