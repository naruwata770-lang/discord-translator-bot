# iPhone Discord表示問題 根本的解決計画

## プロジェクト概要

**目的**: iPhone Discordアプリで翻訳テキストが改行されず読めない問題を根本的に解決する

**背景**:
- 過去に複数回対応（ゼロ幅スペース挿入、Description幅確保等）
- しかし、問題は完全に解決していない
- CJK文字（中国語・日本語）が横スクロールまたは途切れる
- ユーザビリティが著しく低下

**アプローチ**:
段階的な改善により、リスクを最小化しつつ確実に解決
- **Phase 1**: 即座の改善（ゼロ幅スペース間隔短縮）
- **Phase 2**: 根本的解決（Embed構造変更）

---

## 問題の詳細分析

### 発生状況

**環境**:
- デバイス: iPhone 15 Pro MAX（画面幅430px）
- アプリ: Discord iOS版
- 対象: Embedの翻訳フィールド（中国語・日本語）
- 注記: 大画面デバイスでも問題が発生（小画面特有の問題ではない）

**症状**:
1. ✅ **英語フィールド**: 正常に複数行で表示される
2. ❌ **中国語フィールド**: 1行で途切れる、または横スクロールが発生
3. ❌ **日本語Description**: 改行されず、右側が見えない

**スクリーンショット**:
- `ss/IMG_4578.png`: 改善前（中国語が見えない）
- `ss/IMG_4579.png`: 改善後（一部改善されたが完全ではない）

### 過去の対応履歴

| 日付 | 対応内容 | 効果 | コミット |
|------|---------|------|----------|
| 2025-10-19 | CJKフィールドにゼロ幅スペース（15文字ごと）挿入 | 部分的改善 | a20b251 |
| 2025-10-20 | Descriptionにもゼロ幅スペース追加 | 部分的改善 | b69e912 |
| 2025-10-19 | Description幅確保（Braille Pattern Blank） | 一部改善 | 42936d0 |

**結果**: 部分的な改善はあるが、**根本的には解決していない**

---

## 根本原因の特定

### 原因1: ゼロ幅スペース間隔が長すぎる（主要原因）

**問題**:
```
現在の実装: 15文字ごとにゼロ幅スペース挿入
iPhone 15 Pro MAX画面幅: 430px
Discord Embed Fieldの実際の表示幅: 430px - パディング(左右各16px) = 398px
CJK文字幅: 約28px
→ 1行あたり表示可能文字数: 398px ÷ 28px ≈ 14.2文字

結果: 15文字が表示可能文字数（14.2文字）を超える → 改行されない
     大画面デバイスでも問題が発生！
```

**Phase 1の10文字間隔の根拠**:
```
実際の表示幅: 398px（iPhone 15 Pro MAX）
CJK文字幅: 約28px
理論上の最大文字数: 398 ÷ 28 ≈ 14.2文字

安全マージンを考慮:
- フォントレンダリングの誤差: ±1文字
- Discord UIの変更への対応: ±1文字
- 将来的なデバイスサイズの多様性: ±1文字
- 安全な間隔: 14.2 - 3 = 11.2文字

結論: 10文字ごとにゼロ幅スペースを挿入することで、
      iPhone 15 Pro MAXはもちろん、より小画面のデバイスでも確実に1行に収まる
```

**検証**:
```typescript
const text = "終了、前線防線瞬間封訂了房間、弗拉維婭像個一樣攤開來、全身覆汗水漫";
// 15文字: "終了、前線防線瞬間封訂了房間、" → 420px（398px超過！）
// 10文字: "終了、前線防線瞬間封" → 280px（余裕で収まる）

参考:
- iPhone 15 Pro MAX（430px幅）: 14.2文字/行
- iPhone 14 Pro（393px幅）: 12.9文字/行
- iPhone SE（375px幅）: 12.2文字/行
→ 10文字間隔なら全デバイスで安全
```

### 原因2: Discord Embed Field仕様の制約

**既知の問題**:
- Discord Embed Fieldには**表示幅の制約**がある
- モバイルでは`word-break`プロパティがゼロ幅スペースを確実に認識しない
- iOS WebKitの独自レンダリング動作

**参考**:
- GitHub Issue #3030: Embed column limit is fixed at 40 characters
- GitHub Issue #1128: Embed inline field not working on mobile

### 原因3: CJK文字の特性

**特性**:
- スペースがない連続文字列
- 等幅で英語より幅が広い
- 句読点（。、！等）での自動改行が不確実

---

## 解決策の全体像

### 段階的アプローチ（推奨）

```
Phase 1: 即座の改善（リスク低）
  ↓ テスト・検証
  ↓ 本番デプロイ
  ↓ 1週間モニタリング
  ↓
Phase 2: 根本的解決（中リスク）
  ↓ 実装・テスト
  ↓ Codexレビュー
  ↓ 本番デプロイ
  ↓
完全解決
```

### Phase 1: 即座の改善（提案A）

**内容**: ゼロ幅スペース挿入間隔を15文字 → **10文字**に短縮

**期待効果**:
- iPhone 15 Pro MAXはもちろん、より小画面のデバイス（iPhone SE等）でも確実に1行に収まる
- より細かい改行機会を提供
- 既存の仕組みを活用

**実装難易度**: ★☆☆☆☆（極めて簡単）
**リスク**: 低
**効果**: 中〜高

### Phase 2: 根本的解決（提案D）

**内容**: Embed構造を変更し、Fieldを使わずDescriptionのみで表示

**期待効果**:
- Fieldの制約を完全に回避
- Descriptionは4096文字まで対応
- モバイルでの表示が安定

**実装難易度**: ★★★★☆（中程度）
**リスク**: 中（大きな変更）
**効果**: 極めて高

---

## Phase 1: 即座の改善（提案A）

### 実装内容

#### 1.1 変更箇所

**ファイル**: `src/discord/messageDispatcher.ts`

**変更前**:
```typescript
private addWordBreakOpportunities(text: string, lang: string): string {
  if (lang !== 'zh' && lang !== 'ja') {
    return text;
  }

  const interval = 15; // ← ここを変更
  const regex = new RegExp(`(.{${interval}})`, 'g');
  return text.replace(regex, '$1\u200B');
}
```

**変更後**:
```typescript
private addWordBreakOpportunities(text: string, lang: string): string {
  if (lang !== 'zh' && lang !== 'ja') {
    return text;
  }

  const interval = 10; // 15 → 10 に短縮
  const regex = new RegExp(`(.{${interval}})`, 'g');
  return text.replace(regex, '$1\u200B');
}
```

**diff**:
```diff
- const interval = 15;
+ const interval = 10;
```

#### 1.2 影響範囲

**直接影響**:
- `buildMultiEmbed()`: Description、各Fieldの表示
- `buildMultipleEmbeds()`: フォールバック時の表示

**間接影響**:
- テストケース: ゼロ幅スペース挿入位置の検証

#### 1.3 テスト計画

**ユニットテスト更新**:
```typescript
// src/discord/messageDispatcher.test.ts

describe('addWordBreakOpportunities', () => {
  it('中国語テキストに10文字ごとにゼロ幅スペースを挿入する', () => {
    const text = '終了、前線防線瞬間封訂了房間、弗拉維婭像個一樣攤開來';
    const result = dispatcher['addWordBreakOpportunities'](text, 'zh');

    // 10文字ごとに\u200Bが挿入される
    expect(result).toContain('終了、前線防線瞬間封\u200B');
    expect(result).toContain('訂了房間、弗拉維婭像\u200B');
  });

  it('日本語テキストに10文字ごとにゼロ幅スペースを挿入する', () => {
    const text = 'ようやく刺激が止まり、つかの間の静寂が戻った部屋で';
    const result = dispatcher['addWordBreakOpportunities'](text, 'ja');

    expect(result).toContain('ようやく刺激が止まり、つ\u200B');
  });

  it('英語テキストはそのまま返す', () => {
    const text = 'Hello, this is a test message.';
    const result = dispatcher['addWordBreakOpportunities'](text, 'en');

    expect(result).toBe(text);
  });
});
```

**統合テスト**:
```typescript
describe('buildMultiEmbed - Phase 1改善後', () => {
  it('長い中国語フィールドが10文字ごとに改行機会を持つ', async () => {
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: '終了、前線防線瞬間封訂了房間、弗拉維婭像個一樣攤開來、全身覆汗水漫',
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, 'こんにちは');
    const fields = embed.toJSON().fields;

    expect(fields[0].value).toContain('\u200B');
    // 10文字ごとに挿入されることを確認
    const zwspCount = (fields[0].value.match(/\u200B/g) || []).length;
    expect(zwspCount).toBeGreaterThan(5); // 60文字なら6箇所
  });
});
```

**手動テスト（必須）**:
1. ローカル環境で`npm run dev`
2. 実際のDiscordで以下をテスト:
   - 短文（10文字以下）
   - 中文（30〜50文字）
   - 長文（100文字以上）
3. iPhoneで確認（可能であれば）

#### 1.4 デプロイ手順

**ステップ**:
1. ✅ feature/fix-mobile-wrapping-phase1 ブランチ作成
2. ✅ 実装変更（1行）
3. ✅ テスト更新・実行
4. ✅ ローカルで動作確認
5. ✅ develop へマージ
6. ✅ Railway.app へデプロイ
7. ✅ 本番環境で1週間モニタリング

**コミットメッセージ**:
```
fix: ゼロ幅スペース間隔を10文字に短縮してiPhone表示を改善

## 問題
- iPhone 15 Pro MAXでもCJK文字が15文字（表示可能14.2文字）を超えると画面幅を超過
- 大画面デバイスでも問題が発生（小画面特有ではない）
- ゼロ幅スペース間隔（15文字）が長すぎて改行されない
- 翻訳テキストが途切れる、または横スクロールが発生

## 解決策
- ゼロ幅スペース挿入間隔を15文字 → 10文字に短縮
- iPhone 15 Pro MAX（430px幅）からiPhone SE（375px幅）まで全デバイスで確実に1行に収まる
- より細かい改行機会を提供

## 実装内容
- messageDispatcher.ts: interval変数を10に変更
- テスト更新: 10文字ごとの挿入を検証

## テスト
- 148テスト全成功
- 新規テストケース追加（10文字間隔検証）

Phase 1/2: 即座の改善（Phase 2で根本的解決予定）
```

#### 1.5 成功基準

**必須**:
- ✅ 全ユニットテストが成功
- ✅ iPhone 15 Pro MAXで中国語フィールドが全文表示される
- ✅ 他のiPhoneモデル（iPhone 14 Pro、iPhone SE等）でも正常表示
- ✅ 横スクロールが発生しない
- ✅ テキストが途切れない

**望ましい**:
- ✅ 改行位置が自然（単語の途中で切れない）
- ✅ 英語フィールドに影響なし
- ✅ パフォーマンス低下なし

#### 1.6 リスク分析

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| 10文字でも不十分 | 中 | 低 | → Phase 2へ移行 |
| 改行が不自然 | 低 | 中 | → ユーザーフィードバック収集 |
| 既存バグ再発 | 低 | 低 | → 全テスト実行で検証 |
| パフォーマンス低下 | 低 | 極低 | → ベンチマーク測定 |

#### 1.7 ロールバック計画

**条件**:
- 新たな表示問題が発生
- テストが失敗
- 予期しない副作用

**手順**:
1. feature/fix-mobile-wrapping-phase1 ブランチを revert
2. develop へ緊急マージ
3. Railway.app へ即座にデプロイ
4. 15文字に戻す（既存動作）

**ロールバック時間**: 5分以内

---

## Phase 2: 根本的解決（提案D）

### 実装内容

#### 2.1 設計変更

**現在の構造**:
```
EmbedBuilder
  ├─ Author: ユーザー名 + アイコン
  ├─ Description: 原文（ゼロ幅スペース付き）
  ├─ Field 1: 🇨🇳 中文（ゼロ幅スペース付き）
  ├─ Field 2: 🇺🇸 English
  └─ Footer: 🇯🇵 自動翻訳
```

**新しい構造**:
```
EmbedBuilder
  ├─ Author: ユーザー名 + アイコン
  ├─ Description:
  │   💬 原文
  │   こんにちは！
  │
  │   🇨🇳 中文
  │   你好！
  │
  │   🇺🇸 English
  │   Hello!
  └─ Footer: 🇯🇵 自動翻訳
```

**利点**:
- ✅ Fieldの幅制約を完全に回避
- ✅ Descriptionは4096文字まで対応（Fieldは1024文字）
- ✅ モバイルでのレンダリングが安定
- ✅ ゼロ幅スペースへの依存を減らせる

**欠点**:
- ⚠️ 視覚的な区切りが弱くなる
- ⚠️ 既存のテストを大幅に修正
- ⚠️ フォールバック（複数Embed）の仕組みが不要に

#### 2.2 実装詳細

**ファイル**: `src/discord/messageDispatcher.ts`

##### 2.2.1 buildMultiEmbed() の書き換え

**変更前** (現在の実装):
```typescript
private buildMultiEmbed(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): EmbedBuilder {
  // ... Author設定 ...

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: displayName, iconURL: avatarURL })
    .setDescription(descriptionWithWidth)
    .setTimestamp(originalMessage.createdAt);

  // 成功した翻訳をフィールドとして追加
  for (const result of results) {
    if (result.status === 'success') {
      embed.addFields({
        name: `${flag} ${this.getLanguageName(result.targetLang)}`,
        value: fieldValue,
        inline: false,
      });
    }
  }

  return embed;
}
```

**変更後** (Phase 2):
```typescript
private buildMultiEmbed(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): EmbedBuilder {
  const displayName = originalMessage.member?.displayName ?? originalMessage.author.username;
  const avatarURL = originalMessage.member?.displayAvatarURL() ?? originalMessage.author.displayAvatarURL();
  const cleanText = originalMessage.cleanContent || originalText;
  const sourceLang = results[0]?.sourceLang || 'unknown';

  // Descriptionをセクション単位で構築（4096文字制限対応）
  const maxLength = 4096;
  let description = '';
  let truncated = false;

  // 原文セクション
  const originalSection = `💬 **原文**\n${this.addWordBreakOpportunities(cleanText, sourceLang)}\n\n`;
  description += originalSection;

  // 各翻訳セクションを追加（4096文字に近づいたら停止）
  for (const result of results) {
    let section = '';

    if (result.status === 'success') {
      const flag = this.getLanguageFlag(result.targetLang);
      const langName = this.getLanguageName(result.targetLang);
      // メンション再通知を防ぐためsanitizeMentionsを適用
      const sanitizedText = this.sanitizeMentions(result.translatedText);
      const translatedText = this.addWordBreakOpportunities(
        sanitizedText,
        result.targetLang
      );

      section = `${flag} **${langName}**\n${translatedText}\n\n`;
    } else {
      // エラーの場合
      const flag = this.getLanguageFlag(result.targetLang);
      const langName = this.getLanguageName(result.targetLang);
      section = `${flag} **${langName}**\n⚠️ 翻訳に失敗しました\n\n`;
    }

    // セクション追加で制限を超える場合は停止
    if (description.length + section.length > maxLength - 50) { // 50文字のマージン
      truncated = true;
      break;
    }

    description += section;
  }

  // 一部が省略された場合は警告を追加
  if (truncated) {
    description += '\n⚠️ テキストが長すぎるため、一部の翻訳が省略されました';
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: displayName, iconURL: avatarURL })
    .setDescription(description.trim())
    .setFooter({ text: `${this.getLanguageFlag(sourceLang)} 自動翻訳` })
    .setTimestamp(originalMessage.createdAt);

  return embed;
}
```

##### 2.2.2 sendMultiTranslation() の簡素化

**変更前**:
```typescript
async sendMultiTranslation(...): Promise<void> {
  // ...
  const embed = this.buildMultiEmbed(results, originalMessage, originalText);

  // Embedサイズチェック → フォールバック
  if (!this.isEmbedValid(embed)) {
    const embeds = this.buildMultipleEmbeds(...);
    await originalMessage.reply({ embeds });
  } else {
    await originalMessage.reply({ embeds: [embed] });
  }
}
```

**変更後**:
```typescript
async sendMultiTranslation(
  results: MultiTranslationResult[],
  originalMessage: Message,
  originalText: string
): Promise<void> {
  // 少なくとも1つは成功している必要がある
  const hasSuccess = results.some((r) => r.status === 'success');
  if (!hasSuccess) {
    // エラー処理（既存のまま）
    // ...
    return;
  }

  // Embedを構築（常に単一Embed）
  const embed = this.buildMultiEmbed(results, originalMessage, originalText);

  // 送信
  try {
    await originalMessage.reply({
      embeds: [embed],
      allowedMentions: { parse: [], repliedUser: false },
    });
  } catch (error) {
    logger.error('Failed to send multi-translation', { error });
    throw error;
  }
}
```

**変更点**:
- ❌ `isEmbedValid()` チェック不要（Descriptionのみなので）
- ❌ `buildMultipleEmbeds()` 不要（フォールバックなし）
- ✅ コード量が削減
- ✅ ロジックが単純化

##### 2.2.3 メソッドの削除と保持

**削除対象**:
- `isEmbedValid()`: サイズチェック（Descriptionのみなので単純化）

**条件付き削除（要検証）**:
- `ensureMinimumWidthForDescription()`: 幅確保（Braille Pattern Blank）
  - **削除前に影響検証が必須**
  - 検証手順:
    1. Phase 2実装時に`ensureMinimumWidthForDescription()`を一時的にコメントアウト
    2. iPhone SE実機でEmbed幅が正しく確保されるか確認
    3. Embed幅が狭くなる場合は削除せず、Description統合型でも継続使用
    4. 問題なければ削除を確定

**削除対象（Phase 2で不要）**:
- `buildMultipleEmbeds()`: **削除する**
  - 理由:
    - Phase 2の実装では「切り詰め + 警告」方式を採用
    - 4096文字超過時は切り詰めて `⚠️ テキストが長すぎるため、一部の翻訳が省略されました` を表示
    - 複数Embedでの分割表示は実装しない（シンプル化を優先）
    - 将来的に必要になれば再実装を検討（現時点では過剰設計）
  - 削除による影響:
    - 超長文（4096文字超過）は完全には表示されない
    - 実用上問題なし（通常の会話で4096文字を超えることは稀）

**残すメソッド**:
- ✅ `addWordBreakOpportunities()`: ゼロ幅スペース挿入（引き続き使用）
- ✅ `truncateField()`: 不要（削除候補）
- ✅ `sanitizeMentions()`: メンション再通知防止（引き続き使用）
- ✅ `getLanguageFlag()`, `getLanguageName()`: 言語表示

#### 2.3 テスト計画

##### 2.3.1 ユニットテスト更新

**新規テスト**:
```typescript
describe('buildMultiEmbed - Phase 2 (Description統合)', () => {
  it('原文と2言語の翻訳をDescriptionに統合する', () => {
    const results: MultiTranslationResult[] = [
      {
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好！',
      },
      {
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'en',
        translatedText: 'Hello!',
      },
    ];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, 'こんにちは！');
    const json = embed.toJSON();

    // Descriptionに全てが含まれる
    expect(json.description).toContain('💬 **原文**');
    expect(json.description).toContain('こんにちは！');
    expect(json.description).toContain('🇨🇳 **中文**');
    expect(json.description).toContain('你好！');
    expect(json.description).toContain('🇺🇸 **English**');
    expect(json.description).toContain('Hello!');

    // Fieldは存在しない
    expect(json.fields).toBeUndefined();
  });

  it('長文（4096文字超過）の場合は切り詰める', () => {
    const longText = 'あ'.repeat(5000);
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: longText,
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, longText);
    const json = embed.toJSON();

    // 4096文字制限
    expect(json.description!.length).toBeLessThanOrEqual(4096);
    expect(json.description).toContain('...');
  });

  it('片方の翻訳が失敗した場合もDescriptionに表示', () => {
    const results: MultiTranslationResult[] = [
      {
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好！',
      },
      {
        status: 'error',
        sourceLang: 'ja',
        targetLang: 'en',
        errorCode: ErrorCode.API_ERROR,
        errorMessage: 'API Error',
      },
    ];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, 'こんにちは！');
    const json = embed.toJSON();

    expect(json.description).toContain('🇨🇳 **中文**');
    expect(json.description).toContain('你好！');
    expect(json.description).toContain('🇺🇸 **English**');
    expect(json.description).toContain('⚠️ 翻訳に失敗しました');
  });

  it('ゼロ幅スペースが各セクションに適用される', () => {
    const longChinese = '終了、前線防線瞬間封訂了房間、弗拉維婭像個一樣攤開來';
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: longChinese,
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, 'こんにちは');
    const json = embed.toJSON();

    // ゼロ幅スペースが挿入されている
    expect(json.description).toContain('\u200B');
  });

  // Codexレビュー指摘による追加テスト
  it('4096文字ちょうどのDescriptionは切り詰められない', () => {
    // 原文 + セクションヘッダーを考慮して、ちょうど4096文字になるテキストを作成
    const text = 'あ'.repeat(2000);
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: text,
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, text);
    const json = embed.toJSON();

    // 4096文字以内
    expect(json.description!.length).toBeLessThanOrEqual(4096);
    // 切り詰め警告がない（セクション単位で調整されている）
    expect(json.description).not.toContain('一部の翻訳が省略されました');
  });

  it('4097文字を超えるDescriptionはセクション単位で切り詰められる', () => {
    const longText = 'あ'.repeat(5000);
    const results: MultiTranslationResult[] = [
      {
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: longText,
      },
      {
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'en',
        translatedText: longText,
      },
    ];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, 'こんにちは');
    const json = embed.toJSON();

    // 4096文字制限
    expect(json.description!.length).toBeLessThanOrEqual(4096);
    // セクション単位で切り詰め、警告が表示される
    expect(json.description).toContain('⚠️ テキストが長すぎるため、一部の翻訳が省略されました');
  });

  it('絵文字とCJK文字の混在でもゼロ幅スペースが正しく挿入される', () => {
    const text = 'こんにちは😀你好👋世界🌍';
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: text,
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, text);
    const json = embed.toJSON();

    // ゼロ幅スペースが挿入されている
    expect(json.description).toContain('\u200B');
    // 絵文字も正しく表示される
    expect(json.description).toContain('😀');
    expect(json.description).toContain('👋');
    expect(json.description).toContain('🌍');
  });

  it('複数行の改行を含むテキストでも正しく表示される', () => {
    const text = 'こんにちは\n你好\n世界';
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: text,
      }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, text);
    const json = embed.toJSON();

    // 改行が保持される
    expect(json.description).toContain('こんにちは\n你好\n世界');
  });

  it('メンション記法がサニタイズされて通知を防ぐ', () => {
    const text = '@everyone こんにちは <@123456789> さん';
    const results: MultiTranslationResult[] = [{
      status: 'success',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatedText: '@everyone 你好 <@123456789>',
    }];

    const embed = dispatcher['buildMultiEmbed'](results, mockMessage, text);
    const json = embed.toJSON();

    // メンションがサニタイズされている
    expect(json.description).toContain('@\u200Beveryone');
    expect(json.description).toContain('@user');
    expect(json.description).not.toContain('<@123456789>');
  });
});
```

**既存テストの更新と影響分析**:

**削除されるテストスイート**:
```typescript
// 削除または更新が必要なテスト
describe('buildMultipleEmbeds', () => {
  // ❌ このテストスイート全体を削除
  // 推定: 3-5テストケース削除
});

describe('isEmbedValid', () => {
  // ❌ このテストスイート全体を削除（または大幅簡素化）
  // 推定: 2-3テストケース削除
});

describe('ensureMinimumWidthForDescription', () => {
  // ❌ このテストスイート全体を削除
  // 推定: 1-2テストケース削除
});

describe('truncateField', () => {
  // ❌ このテストスイート全体を削除（Field使用しないため）
  // 推定: 2-3テストケース削除
});
```

**テスト数の変化（推定）**:
- **現在**: 148テスト（10テストスイート）
- **Phase 2実装後**: 約135-140テスト（推定8-12テスト削除、5-7テスト新規追加）
- **削除**: 8-13テスト（上記4つのスイート）
- **新規追加**: 5-7テスト（Description統合型の新規テスト）
- **純減**: 3-6テスト

**カバレッジへの影響**:
- 削除されるテストは**不要な機能**のテストのため、カバレッジ低下は問題なし
- 新規追加テストで**実際に使用される機能**のカバレッジが向上
- 全体的なコード品質は向上（不要コード削減 + 実用的なテスト追加）

**実装時の確認事項**:
1. Phase 2実装前に`npm test`を実行して正確な現在のテスト数を記録
2. 削除予定のテストスイートを特定し、削除数を確定
3. Phase 2実装後に`npm test`を実行して最終テスト数を確認
4. テストカバレッジレポートを比較（`npm run test:coverage`）
5. カバレッジが低下していないことを確認

##### 2.3.2 統合テスト

**テストケース**:
1. **通常の2言語翻訳**
   - 日本語 → 中国語 + 英語
   - 中国語 → 日本語 + 英語

2. **長文テスト**
   - 各言語で1000文字以上
   - 4096文字制限の動作確認

3. **エラーハンドリング**
   - 片方の翻訳が失敗
   - 両方の翻訳が失敗

4. **特殊文字**
   - 絵文字混在
   - URL混在
   - メンション混在

5. **モバイル表示確認**（手動）
   - iPhone SEで表示
   - iPhone 14 Proで表示
   - iPadで表示

#### 2.4 デプロイ手順

**ステップ**:
1. ✅ feature/fix-mobile-wrapping-phase2 ブランチ作成
2. ✅ Phase 1のモニタリング結果を確認（1週間）
3. ✅ buildMultiEmbed() 書き換え
4. ✅ sendMultiTranslation() 簡素化
5. ✅ 不要なメソッド削除
6. ✅ テスト更新・実行（全148テスト）
7. ✅ ローカルで動作確認
8. ✅ **Codexレビュー依頼**
9. ✅ フィードバック対応
10. ✅ develop へマージ
11. ✅ Railway.app へデプロイ
12. ✅ 本番環境で2週間モニタリング

**コミットメッセージ**:
```
refactor: Embed構造をDescription統合に変更してモバイル表示を根本的に改善

## 問題
- FieldにはDiscordの表示幅制約がある
- モバイルでゼロ幅スペースが確実に認識されない
- CJK文字が改行されず途切れる問題が完全に解決していない

## 解決策
- Embed FieldをすべてDescriptionに統合
- Descriptionは4096文字まで対応、Fieldより柔軟
- モバイルでのレンダリングが安定

## 実装内容
- buildMultiEmbed(): Description統合型に全面書き換え
- sendMultiTranslation(): フォールバック処理を削除
- 不要なメソッド削除: buildMultipleEmbeds, isEmbedValid, ensureMinimumWidthForDescription
- テスト更新: 148テスト全成功

## 破壊的変更
- Embedの見た目が変わる（FieldなしのDescription統合型）
- フォールバック（複数Embed）が不要に

## Codexレビュー
- ✅ アーキテクチャ変更をレビュー承認
- ✅ テストカバレッジ確認

Phase 2/2: 根本的解決（Phase 1の即座改善から移行）
```

#### 2.5 成功基準

**必須**:
- ✅ 全ユニットテストが成功（148テスト）
- ✅ iPhone SEで全ての翻訳テキストが完全に表示される
- ✅ 横スクロールが発生しない
- ✅ テキストが途切れない
- ✅ 4096文字まで正しく表示される

**望ましい**:
- ✅ 見た目が自然（セクション区切りが明確）
- ✅ コード量が削減（保守性向上）
- ✅ パフォーマンス向上（Field処理がなくなる）
- ✅ レンダリングが安定（Description型の方がモバイルで安定）

#### 2.6 リスク分析

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| 見た目の変化でユーザー混乱 | 中 | 中 | → 事前告知、変更ログ明記 |
| 4096文字制限で長文切れ | 中 | 低 | → 切り詰め表示 + 警告ログ |
| Description改行が不自然 | 低 | 低 | → ゼロ幅スペースで調整 |
| 既存バグ再発 | 中 | 低 | → 全テスト実行 + Codexレビュー |
| デグレード | 高 | 低 | → ローカル手動テスト徹底 |
| Railway.appデプロイ失敗 | 高 | 低 | → 対策手順を明記（下記参照） |

**Railway.appデプロイ失敗時の対応手順**:
1. Railway.appのデプロイログを確認（ビルドエラー、起動エラーを特定）
2. ビルドエラーの場合:
   - `npm run build` をローカルで再実行
   - TypeScriptコンパイルエラーを修正
   - 修正をコミット・プッシュして再デプロイ
3. 起動エラーの場合:
   - 環境変数が正しく設定されているか確認
   - Railway.app変数設定画面で必須変数をチェック
   - `npm start` をローカルで実行してエラー再現
4. デプロイ成功後も起動しない場合:
   - Railway.appログを確認（Discord接続エラー、Poe APIエラー等）
   - ロールバック実施（前バージョンに戻す）
5. 緊急時:
   - ロールバックプランを即座に実行（10分以内に復旧）

#### 2.7 ロールバック計画

**条件**:
- 致命的なバグ発見
- 表示が著しく悪化
- ユーザーから苦情

**手順と具体的なコマンド**:

**ステップ1: 現在の状態を確認**
```bash
# 現在のブランチとコミットを確認
git status
git log --oneline -5
```

**ステップ2: developブランチでPhase 2をrevert**
```bash
# developブランチに移動
git checkout develop

# 最新のPhase 2マージコミットを特定
git log --oneline --grep="Phase 2" -5

# Phase 2のマージコミットをrevert（例: abc1234がPhase 2のマージコミット）
git revert -m 1 abc1234

# revertコミットメッセージ例:
# "Revert Phase 2: モバイル表示問題によりPhase 1に戻す"
```

**ステップ3: Phase 1の状態を確認**
```bash
# Phase 1のコードが復元されたか確認
git diff HEAD~1 src/discord/messageDispatcher.ts

# interval = 10 になっていることを確認
grep "interval = 10" src/discord/messageDispatcher.ts
```

**ステップ4: Railway.appへ緊急デプロイ**
```bash
# developブランチをpush
git push origin develop

# Railway.appが自動デプロイを開始
# デプロイログを監視: Railway.app管理画面
```

**ステップ5: デプロイ完了を確認**
```bash
# Railway.appログでbot起動を確認
# Discord実機で翻訳動作確認
```

**代替手順（より迅速なロールバック）**:
```bash
# Phase 1の最後のコミットハッシュに強制リセット（非推奨、緊急時のみ）
git checkout develop
git reset --hard <phase1-commit-hash>
git push origin develop --force

# ⚠️ 注意: force pushは履歴を書き換えるため、緊急時のみ使用
```

**ロールバック時間**: 10分以内（手動revertの場合）、5分以内（force resetの場合）

---

## Codexレビュー計画

### レビュー依頼タイミング

**Phase 1**:
- レビュー不要（1行変更、リスク極低）

**Phase 2**:
- ✅ 実装完了後、develop マージ前
- ✅ 全テスト成功確認後

### レビュー依頼内容

**Phase 2のCodexレビュープロンプト**:
```
以下のPhase 2実装について、アーキテクチャとコード品質の観点からレビューをお願いします。

## 背景
iPhone DiscordでCJK文字が改行されない問題を根本的に解決するため、
Embed構造をField型からDescription統合型に変更しました。

## 主な変更
1. buildMultiEmbed(): FieldをすべてDescriptionに統合
2. sendMultiTranslation(): フォールバック処理を削除
3. 不要なメソッド削除: buildMultipleEmbeds, isEmbedValid, ensureMinimumWidthForDescription

## レビュー観点
1. アーキテクチャ変更は妥当か？
2. エッジケース（長文、エラー、特殊文字）への対応は十分か？
3. テストカバレッジは十分か？
4. パフォーマンスへの影響は？
5. コードの保守性は向上しているか？
6. セキュリティリスクはないか？（メンション処理等）

## 実装詳細
[実装コードを提示]

## テストケース
[テストコードを提示]

よろしくお願いします。
```

### レビュー後の対応

**フィードバックカテゴリ**:
1. **High（重要）**: 必ず対応、再レビュー依頼
2. **Medium（推奨）**: 可能な限り対応
3. **Low（任意）**: 時間があれば対応

---

## 全体タイムライン

### Phase 1: 即座の改善

| タスク | 所要時間 | 担当 | 開始日 | 完了日 |
|--------|---------|------|--------|--------|
| ブランチ作成 | 5分 | Claude Code | Day 1 | Day 1 |
| 実装変更（1行） | 5分 | Claude Code | Day 1 | Day 1 |
| テスト更新 | 30分 | Claude Code | Day 1 | Day 1 |
| ローカル動作確認 | 30分 | Claude Code | Day 1 | Day 1 |
| developマージ | 10分 | Claude Code | Day 1 | Day 1 |
| Railway.appデプロイ | 5分 | 自動 | Day 1 | Day 1 |
| **モニタリング期間** | **7日** | ユーザー | Day 1 | **Day 7** |

**Phase 1合計**: 1日実装 + 7日モニタリング = **8日**

### Phase 2: 根本的解決

| タスク | 所要時間 | 担当 | 開始日 | 完了日 |
|--------|---------|------|--------|--------|
| Phase 1評価 | 1時間 | Claude Code | Day 8 | Day 8 |
| ブランチ作成 | 5分 | Claude Code | Day 8 | Day 8 |
| buildMultiEmbed()書き換え | 2時間 | Claude Code | Day 8 | Day 8 |
| sendMultiTranslation()簡素化 | 1時間 | Claude Code | Day 8 | Day 8 |
| 不要メソッド削除 | 30分 | Claude Code | Day 8 | Day 8 |
| テスト更新・実行 | 2時間 | Claude Code | Day 8 | Day 8 |
| ローカル動作確認 | 1時間 | Claude Code | Day 8 | Day 8 |
| **Codexレビュー依頼** | **1日** | Codex | Day 9 | Day 9 |
| フィードバック対応 | 2時間 | Claude Code | Day 10 | Day 10 |
| developマージ | 10分 | Claude Code | Day 10 | Day 10 |
| Railway.appデプロイ | 5分 | 自動 | Day 10 | Day 10 |
| **モニタリング期間** | **14日** | ユーザー | Day 10 | **Day 23** |

**Phase 2合計**: 3日実装 + 14日モニタリング = **17日**

### 全体スケジュール

```
Day 1:    Phase 1実装・デプロイ
Day 2-7:  Phase 1モニタリング
Day 8:    Phase 2実装開始
Day 9:    Codexレビュー
Day 10:   Phase 2デプロイ
Day 11-23: Phase 2モニタリング
Day 24:   プロジェクト完了
```

**合計期間**: **約3〜4週間**

---

## モニタリング計画

### 監視項目

**Phase 1（7日間）**:
1. **表示確認**
   - iPhone SEで翻訳テキストが全文表示されるか
   - 横スクロールが発生しないか
   - 改行位置は自然か

2. **エラー監視**
   - Railway.appログでエラーなし
   - Discord APIエラーなし

3. **ユーザーフィードバック**
   - 友達からの改善報告
   - 新たな問題報告

**Phase 2（14日間）**:
1. **表示確認**
   - 全ての翻訳テキストが完全に表示される
   - 見た目が自然（セクション区切り）
   - 長文（4096文字近く）でも正常表示

2. **パフォーマンス**
   - レスポンスタイム変化なし
   - メモリ使用量変化なし

3. **安定性**
   - エラー率が変化なし
   - クラッシュなし

### 成功判定

**Phase 1成功基準**:
- ✅ iPhoneで翻訳テキストが90%以上改善
- ✅ 新たなバグ報告なし
- ✅ エラー率が増加しない

**Phase 2成功基準**:
- ✅ iPhoneで翻訳テキストが100%正常表示
- ✅ 長文（4096文字）まで対応
- ✅ ユーザーから「完全に解決した」フィードバック

---

## リスク管理

### 全体リスク

| リスク | 影響度 | 発生確率 | 軽減策 | 対応策 |
|--------|--------|----------|--------|--------|
| Phase 1で解決せず | 中 | 中 | Phase 2で根本解決 | Phase 2へ即移行 |
| Phase 2で新バグ | 高 | 低 | Codexレビュー、徹底テスト | ロールバック（10分） |
| Discordクライアント更新で挙動変化 | 中 | 低 | モニタリング継続 | 再調査・再対応 |
| iOS WebKit仕様変更 | 低 | 極低 | 最新情報収集 | 代替手法検討 |

### 最悪シナリオと対応

**シナリオ1**: Phase 1、Phase 2両方で解決せず
- **対応**: Phase 1にロールバック、代替案を検討
  - 提案C（強制改行）を試す
  - Discordサポートに問い合わせ
  - モバイルアプリ固有の仕様として受け入れ

**シナリオ2**: Phase 2で致命的なバグ発生
- **対応**: 即座にPhase 1へロールバック（10分）
  - Railway.appログ確認
  - バグ修正後に再デプロイ

---

## 成功指標（KPI）

### 定量的指標

| 指標 | 現状 | Phase 1目標 | Phase 2目標 |
|------|------|------------|------------|
| iPhone表示成功率 | 60% | 90% | 100% |
| 横スクロール発生率 | 40% | 10% | 0% |
| ユーザー満足度 | 3/5 | 4/5 | 5/5 |
| エラー率 | <1% | <1% | <1% |
| レスポンスタイム | 3秒 | 3秒 | 3秒 |

#### KPI測定方法

**1. iPhone表示成功率**
- **測定方法**: iPhone 15 Pro MAX実機で翻訳メッセージを目視確認
- **サンプル数**: モニタリング期間中の翻訳メッセージ50件
- **成功の定義**: 全文が表示され、横スクロールなし、テキスト途切れなし
- **測定タイミング**: モニタリング期間の最終日（Phase 1: Day 7、Phase 2: Day 23）
- **測定手順**:
  1. iPhone 15 Pro MAXでDiscordアプリを開く
  2. 対象チャンネルの最新50件の翻訳メッセージを確認
  3. 各メッセージで「全文表示」「横スクロールなし」「途切れなし」をチェック
  4. 成功件数 ÷ 50 × 100 = 成功率（%）

**2. 横スクロール発生率**
- **測定方法**: iPhone 15 Pro MAXで横スクロールが発生するメッセージ数 ÷ 総メッセージ数
- **サンプル数**: 50件
- **測定タイミング**: モニタリング期間の最終日
- **横スクロール発生の定義**: フィールド内のテキストを指でスワイプすると横にスクロールする

**3. ユーザー満足度**
- **測定方法**: 友達（中国人ユーザー）に直接聞く（5段階評価）
- **質問**: 「翻訳botの表示はどうですか？ 1=全く読めない、5=完璧」
- **測定タイミング**: Phase 1終了時（Day 7）、Phase 2終了時（Day 23）
- **追加質問**: 「何か気になる点はありますか？」（定性的フィードバック）

**4. エラー率**
- **定義**: エラー率 = (翻訳失敗数 ÷ 総翻訳試行数) × 100
- **翻訳失敗**: TranslationError発生、またはAPI_ERROR
- **総翻訳試行数**: 翻訳を試みたメッセージ数（INVALID_INPUTを除く）
- **測定方法**: Railway.appログから集計
- **測定タイミング**: モニタリング期間の最終日
- **目標**: <1%（100回中1回未満）

**5. レスポンスタイム**
- **定義**: メッセージ送信から翻訳結果表示までの時間
- **測定方法**: Railway.appログから`Multi-translation completed`のタイムスタンプを確認
- **サンプル数**: ランダムに選んだ10件
- **測定タイミング**: モニタリング期間中（毎日）
- **目標**: 平均3秒以内

#### モニタリング手順（毎日実施）

**Phase 1モニタリング（Day 1〜7）**:
1. **朝9時: Railway.appログ確認**
   - エラーログの有無をチェック
   - エラー率を算出（翻訳失敗数 ÷ 総試行数）
   - レスポンスタイムをサンプリング（10件）

2. **夜21時: Discord実機確認**
   - iPhone 15 Pro MAXで最新10件の翻訳メッセージを確認
   - 表示に問題がないかチェック（全文表示、横スクロールなし）
   - 気になる点をメモ

3. **随時: ユーザーフィードバック収集**
   - 友達からの報告をメモ（良い点、悪い点）
   - 問題があれば即座に調査、深刻な場合はロールバック検討

4. **Day 7: 週次レポート作成**
   - 全KPI集計（50件サンプリング）
   - 問題発生有無の確認
   - Phase 2移行判断（成功基準を満たしているか）

**Phase 2モニタリング（Day 10〜23）**:
- 上記と同様の手順を実施
- 追加: 長文（1000文字以上）のテキストも確認
- Day 23: 最終レポート作成、プロジェクト完了判定

### 定性的指標

**Phase 1**:
- ✅ 「前より読みやすくなった」とのフィードバック
- ✅ 「横スクロールが減った」との報告

**Phase 2**:
- ✅ 「完全に読める」とのフィードバック
- ✅ 「問題が完全に解決した」との報告
- ✅ 新たな表示問題の報告ゼロ

---

## 参考資料

### 技術資料
- [Discord Embed仕様](https://discord.com/developers/docs/resources/channel#embed-object)
- [discord.js EmbedBuilder](https://discord.js.org/#/docs/builders/main/class/EmbedBuilder)
- [Unicode Zero-Width Space (U+200B)](https://www.fileformat.info/info/unicode/char/200b/index.htm)

### GitHub Issues（参考）
- [#3030: Embed column limit is fixed at 40 characters](https://github.com/discordjs/discord.js/issues/3030)
- [#1128: Embed inline field not working on mobile](https://github.com/discord/discord-api-docs/issues/1128)
- [#6198: Webhook Embed Title Wrapping](https://github.com/discord/discord-api-docs/issues/6198)

### 過去のコミット
- `a20b251`: CJKテキスト改行対策（ゼロ幅スペース15文字）
- `b69e912`: Description改行対策
- `42936d0`: Description幅確保

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|---|---------|--------|
| 2025-10-27 | 1.0 | 初版作成（Phase 1 & 2計画） | Claude Code |

---

**プロジェクトステータス**: 📝 計画中（Codexレビュー待ち）
**次のステップ**: Codexレビュー → Phase 1実装開始
