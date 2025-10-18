# Phase 3: 2言語同時翻訳機能 実装計画

## プロジェクト概要

**目的**: ユーザーが送信したメッセージを2つの言語に同時翻訳し、ニュアンスの正確な理解とコミュニケーション品質を向上させる。

**背景**:
- 日中双方のユーザーは英語をある程度理解できる
- 2つの翻訳を見比べることで翻訳のニュアンスを正確に把握
- 誤訳の検出と翻訳精度の向上

## 翻訳動作

### 現在 (Phase 2)
```
日本語 → 中国語
中国語 → 日本語
```

### Phase 3 完成後
```
日本語 → 中国語 + 英語 (2つ同時表示)
中国語 → 日本語 + 英語 (2つ同時表示)
```

## アーキテクチャ設計

### 実装アプローチ: multiTranslate メソッド

Codexの推奨に基づき、**Option B: 新しいmultiTranslate()メソッド**を採用。

#### 利点
1. **拡張性**: 将来的に1回のAPI呼び出しで複数言語対応可能
2. **最適化の余地**: 現在は並列実行、将来はバッチ処理に移行可能
3. **部分成功の許容**: 片方の翻訳が失敗しても続行
4. **集約管理**: 辞書連携や言語追加を一箇所で管理

#### インターフェース設計

```typescript
interface MultiTranslateTarget {
  lang: 'ja' | 'zh' | 'en';
  outputFormat?: 'text' | 'markdown';
}

// Discriminated Union で型安全性を確保
type MultiTranslationResult =
  | {
      status: 'success';
      sourceLang: string;
      targetLang: string;
      translatedText: string;
      glossaryHints?: DictionaryMatch[];
    }
  | {
      status: 'error';
      sourceLang: string;
      targetLang: string;
      errorCode: ErrorCode;
      errorMessage: string;
    };

// TranslationService
async multiTranslate(
  text: string,
  targets: MultiTranslateTarget[]
): Promise<MultiTranslationResult[]>
```

**型定義の利点**:
- コンパイル時の型安全性: `status` で分岐すれば必須フィールドが保証される
- 実行時エラーの防止: `undefined` チェックが不要
- 明確なエラーハンドリング: エラー情報が構造化される

### UI/UX設計

#### 表示形式: 単一Embed (推奨)

**理由**:
- 最も視認性が高い
- スレッドでも省スペース
- 反応やリアクションが1箇所にまとまる

**基本フォーマット**:
```
┌──────────────────────────────┐
│ 💬 原文: こんにちは          │
├──────────────────────────────┤
│ 🇨🇳 中文: 你好               │
│ 🇬🇧 English: Hello           │
└──────────────────────────────┘
```

**辞書ヒント付きフォーマット**:
```
┌──────────────────────────────┐
│ 💬 原文: Strinova楽しいよね  │
├──────────────────────────────┤
│ 🇨🇳 中文: 卡拉彼丘很有趣呢   │
│   📖 Strinova → 卡拉彼丘     │
│ 🇬🇧 English: Strinova is fun │
└──────────────────────────────┘
```

**エラー時のフォーマット**:
```
┌──────────────────────────────┐
│ 💬 原文: こんにちは          │
├──────────────────────────────┤
│ 🇨🇳 中文: 你好               │
│ 🇬🇧 English: ❌ 翻訳失敗     │
└──────────────────────────────┘
```

#### フォールバック: 2つのEmbed

**トリガー条件**:
1. Embed全体の文字数が5500文字を超える場合
2. いずれかのフィールドが1024文字を超える場合

**分割戦略**:
```
単一Embed (原文 + 翻訳1 + 翻訳2)
↓ 文字数オーバー
2つのEmbed (翻訳1, 翻訳2)
```

**例**:
```
┌──────────────────┐  ┌──────────────────┐
│ 🇨🇳 中文         │  │ 🇬🇧 English      │
│ 你好             │  │ Hello            │
│ (原文は省略)     │  │ (原文は省略)     │
└──────────────────┘  └──────────────────┘
```

**フィールド内の文字数制限対応**:
- 各フィールドが1024文字を超える場合は切り詰め
- `...` で省略表示
- 辞書ヒントは優先して表示

### 辞書統合設計

#### 辞書マッチングフロー

```
1. ユーザーメッセージ受信
2. 言語検出 (ja/zh/en)
3. ターゲット言語決定 (例: ja → [zh, en])
4. 各ターゲット言語ごとに辞書マッチング
   - ja → zh: 日本語エイリアスをマッチング → 中国語ターゲット
   - ja → en: 日本語エイリアスをマッチング → 英語ターゲット
5. 辞書ヒントを各翻訳リクエストに付与
6. 並列翻訳実行
7. 結果に辞書情報を添付
```

#### MultiTranslationResult での辞書情報

```typescript
type MultiTranslationResult =
  | {
      status: 'success';
      sourceLang: string;
      targetLang: string;
      translatedText: string;
      glossaryHints?: DictionaryMatch[];  // 辞書マッチング結果
    }
  | {
      status: 'error';
      sourceLang: string;
      targetLang: string;
      errorCode: ErrorCode;
      errorMessage: string;
    };
```

**辞書マッチングは同期処理**:
- DictionaryServiceは同期的にマッチング結果を返す
- 非同期処理は不要（YAMLファイルは起動時にメモリにロード済み）

#### Embed表示での辞書ヒント

各翻訳フィールドの末尾に脚注形式で追加：

```typescript
field.value = `${translatedText}\n${formatGlossaryHints(glossaryHints)}`;

function formatGlossaryHints(hints: DictionaryMatch[]): string {
  if (!hints || hints.length === 0) return '';
  return hints.map(h => `📖 ${h.matchedTerm} → ${h.targetTerm}`).join('\n');
}
```

### エラーハンドリング

#### 部分成功の許容

```typescript
const results = await multiTranslate(text, [
  { lang: 'zh' },
  { lang: 'en' }
]);

// results[0]: { status: 'success', translatedText: '你好', ... }
// results[1]: { status: 'error', errorCode: ErrorCode.API_ERROR, ... }
```

#### リトライ戦略

**責任の所在**: `TranslationService.translate()` 内でリトライを実行
- `multiTranslate()` はリトライしない（translate内で完結）
- 既存のリトライロジック（PoeApiClient）を活用
- 重複リトライを防止

**リトライ対象**:
- ネットワークエラー: 最大3回（既存実装）
- レート制限: Retry-Afterヘッダーに従う（既存実装）
- タイムアウト: 1回リトライ

**リトライしないエラー**:
- 認証エラー (401/403)
- 無効な入力 (400)
- API形式エラー

#### エラー表示戦略

1. **UI表示**: エラー言語には明確なメッセージを表示
2. **ログ記録**: エラー内容とリトライ履歴を監視ログへ送出
3. **部分成功**: 1つでも成功すれば結果を表示
4. **全失敗**: エラーメッセージのみを表示

#### エラーメッセージ例

```typescript
const errorMessages: Record<ErrorCode, string> = {
  NETWORK_ERROR: '❌ ネットワークエラー',
  RATE_LIMIT: '❌ レート制限中 (しばらくお待ちください)',
  API_ERROR: '❌ API エラー',
  AUTH_ERROR: '❌ 認証エラー',
  INVALID_INPUT: '❌ 無効な入力',
};

function formatErrorMessage(result: MultiTranslationResult): string {
  if (result.status === 'error') {
    return errorMessages[result.errorCode] || '❌ 翻訳失敗';
  }
  return result.translatedText;
}
```

## 実装フェーズ

### Phase 3.1: multiTranslate 実装

**目的**: TranslationServiceにmultiTranslate()メソッドを追加

#### タスク

1. **型定義の追加**
   - `MultiTranslateTarget` インターフェース
   - `TranslationResult` の拡張 (glossaryHints追加)

2. **multiTranslate() メソッド実装**
   ```typescript
   async multiTranslate(
     text: string,
     targets: MultiTranslateTarget[]
   ): Promise<Partial<TranslationResult>[]> {
     // 1. 言語検出
     const sourceLang = this.detectLanguage(text);

     // 2. 各ターゲットに対して並列翻訳
     const promises = targets.map(async (target) => {
       try {
         // 2.1 辞書マッチング
         const glossaryHints = this.dictionaryService?.findMatches(
           text,
           sourceLang,
           target.lang
         );

         // 2.2 翻訳実行
         const result = await this.translate(text, {
           sourceLang,
           targetLang: target.lang
         });

         // 2.3 辞書情報を添付
         return { ...result, glossaryHints };
       } catch (error) {
         // 部分失敗を許容
         return {
           error,
           sourceLang,
           targetLang: target.lang
         };
       }
     });

     return Promise.all(promises);
   }
   ```

3. **ユニットテスト作成**
   - 正常系: 2言語の翻訳成功
   - 異常系: 片方の翻訳失敗（部分成功）
   - エッジケース: 辞書マッチあり/なし

#### 成功基準

- [ ] multiTranslate()が2言語の翻訳を返す
- [ ] 辞書ヒントが各翻訳結果に含まれる
- [ ] 片方の翻訳が失敗しても続行する
- [ ] 全ユニットテストが成功

### Phase 3.2: MessageDispatcher 拡張

**目的**: 複数翻訳結果を単一Embedで表示

#### タスク

1. **sendMultiTranslation() メソッド追加**
   ```typescript
   async sendMultiTranslation(
     message: Message,
     originalText: string,  // NEW: 原文を受け取る
     results: MultiTranslationResult[]
   ): Promise<void> {
     // 単一Embedを試行
     const singleEmbed = this.buildSingleEmbed(originalText, results);

     // 文字数チェック
     if (this.isEmbedValid(singleEmbed)) {
       await message.reply({ embeds: [singleEmbed] });
     } else {
       // フォールバック: 2つのEmbedに分割
       const embeds = this.buildMultipleEmbeds(results);
       await message.reply({ embeds });
     }
   }
   ```

2. **Embed構築ロジック**
   ```typescript
   private buildSingleEmbed(
     originalText: string,
     results: MultiTranslationResult[]
   ): EmbedBuilder {
     const embed = new EmbedBuilder()
       .setColor('#0099ff')
       .addFields(
         {
           name: '💬 原文',
           value: this.truncateField(originalText, 1024)
         },
         ...results.map(r => this.buildTranslationField(r))
       );

     return embed;
   }

   private buildTranslationField(
     result: MultiTranslationResult
   ): { name: string; value: string } {
     const flag = this.getLanguageFlag(result.targetLang);
     const label = this.getLanguageLabel(result.targetLang);

     if (result.status === 'error') {
       return {
         name: `${flag} ${label}`,
         value: this.formatErrorMessage(result)
       };
     }

     let value = result.translatedText;
     if (result.glossaryHints?.length > 0) {
       value += '\n' + this.formatGlossaryHints(result.glossaryHints);
     }

     // フィールドの文字数制限（1024文字）
     return {
       name: `${flag} ${label}`,
       value: this.truncateField(value, 1024)
     };
   }

   private truncateField(text: string, maxLength: number): string {
     if (text.length <= maxLength) return text;
     return text.substring(0, maxLength - 3) + '...';
   }
   ```

3. **フォールバック: 2つのEmbedに分割**
   ```typescript
   private buildMultipleEmbeds(
     results: MultiTranslationResult[]
   ): EmbedBuilder[] {
     return results.map(result => {
       const flag = this.getLanguageFlag(result.targetLang);
       const label = this.getLanguageLabel(result.targetLang);

       let value: string;
       if (result.status === 'error') {
         value = this.formatErrorMessage(result);
       } else {
         value = result.translatedText;
         if (result.glossaryHints?.length > 0) {
           value += '\n' + this.formatGlossaryHints(result.glossaryHints);
         }
       }

       return new EmbedBuilder()
         .setColor('#0099ff')
         .setTitle(`${flag} ${label}`)
         .setDescription(this.truncateField(value, 4096));
     });
   }
   ```

3. **ヘルパー関数**
   ```typescript
   private getLanguageFlag(lang: string): string {
     const flags = { ja: '🇯🇵', zh: '🇨🇳', en: '🇬🇧' };
     return flags[lang] || '🌐';
   }

   private getLanguageLabel(lang: string): string {
     const labels = { ja: '日本語', zh: '中文', en: 'English' };
     return labels[lang] || lang;
   }

   private formatGlossaryHints(hints: DictionaryMatch[]): string {
     return hints.map(h => `📖 ${h.matchedTerm} → ${h.targetTerm}`).join('\n');
   }
   ```

4. **文字数制限チェック**
   ```typescript
   private isEmbedValid(embed: EmbedBuilder): boolean {
     // Embed全体の制限: 6000文字
     const totalLength = this.calculateEmbedLength(embed);
     if (totalLength > 5500) return false; // 余裕を持たせる

     // フィールドごとの制限: 1024文字
     const hasOversizedField = embed.data.fields?.some(
       f => f.value.length > 1024
     );
     if (hasOversizedField) return false;

     return true;
   }

   private calculateEmbedLength(embed: EmbedBuilder): number {
     let total = 0;
     if (embed.data.title) total += embed.data.title.length;
     if (embed.data.description) total += embed.data.description.length;
     if (embed.data.fields) {
       total += embed.data.fields.reduce(
         (sum, f) => sum + f.name.length + f.value.length,
         0
       );
     }
     return total;
   }
   ```

#### 成功基準

- [ ] 単一Embedに2つの翻訳が表示される
- [ ] 辞書ヒントが脚注形式で表示される
- [ ] エラー時に適切なメッセージが表示される
- [ ] 文字数制限を超えた場合、2つのEmbedに分割される
- [ ] フィールドが1024文字を超える場合、切り詰められる
- [ ] originalTextが正しく表示される

#### テストケース

1. **通常の翻訳**
   - 短文（100文字以下）
   - 中文（500文字程度）

2. **辞書ヒント付き**
   - 辞書マッチあり
   - 辞書マッチなし

3. **エラーハンドリング**
   - 片方のみエラー
   - 両方エラー

4. **文字数制限**
   - フィールドが1024文字を超える場合
   - Embed全体が5500文字を超える場合（2つのEmbedに分割）

5. **フォールバック**
   - 単一Embed→複数Embedへの切り替え

### Phase 3.3: MessageHandler 統合

**目的**: MessageHandlerでmultiTranslateを呼び出す

#### タスク

1. **自動翻訳ロジックの更新**
   ```typescript
   private async handleAutoTranslation(message: Message): Promise<void> {
     try {
       // 1. 言語検出
       const sourceLang = this.languageDetector.detect(message.content);

       // 2. ターゲット言語決定
       const targets = this.determineTargets(sourceLang);

       // 3. 複数言語翻訳
       const results = await this.translationService.multiTranslate(
         message.content,
         targets
       );

       // 4. 結果送信（原文も渡す）
       await this.dispatcher.sendMultiTranslation(
         message,
         message.content,  // 原文
         results
       );

       logger.info('Multi-translation completed', {
         sourceLang,
         targets: targets.map(t => t.lang),
       });
     } catch (error) {
       await this.dispatcher.sendError(message, error);
       logger.error('Multi-translation failed', { error });
     }
   }

   private determineTargets(sourceLang: string): MultiTranslateTarget[] {
     // 日本語 → 中国語 + 英語
     // 中国語 → 日本語 + 英語
     if (sourceLang === 'ja') {
       return [{ lang: 'zh' }, { lang: 'en' }];
     } else if (sourceLang === 'zh') {
       return [{ lang: 'ja' }, { lang: 'en' }];
     }
     // 英語など → 日本語のみ（後方互換）
     return [{ lang: 'ja' }];
   }
   ```

2. **統合テスト作成**
   - 日本語メッセージ → 中国語 + 英語
   - 中国語メッセージ → 日本語 + 英語
   - 辞書マッチありのケース（「Strinova楽しい」など）
   - エラーハンドリング（片方失敗、両方失敗）
   - 長文（文字数制限テスト）
   - 2つのEmbedへのフォールバック

#### 成功基準

- [ ] 日本語メッセージが中国語+英語に翻訳される
- [ ] 中国語メッセージが日本語+英語に翻訳される
- [ ] 辞書ヒントが正しく表示される
- [ ] 統合テストが全て成功

### Phase 3.4: 最終テスト・デプロイ

**目的**: 実際のDiscord環境での動作確認とデプロイ

#### タスク

1. **ローカルテスト**
   - `npm run dev` で起動
   - 実際のDiscordで各種メッセージをテスト
   - UI/UXの確認

2. **パフォーマンステスト**
   - 複数ユーザーの同時メッセージ
   - レート制限の動作確認
   - API呼び出し数のモニタリング

3. **Codexレビュー**
   - 実装内容のレビュー依頼
   - フィードバック対応

4. **デプロイ**
   - feature/phase3ブランチ作成
   - develop へマージ
   - main へマージ
   - Railway.app へデプロイ

#### 成功基準

- [ ] 実際のDiscordで期待通りの動作を確認
- [ ] パフォーマンス問題なし
- [ ] Codexレビュー承認
- [ ] 本番環境で正常動作

## コスト最適化戦略

### 現時点（並列実行）

- API呼び出し: **2回/メッセージ**
- コスト: 約2倍

### 将来の最適化案

1. **プロバイダのマルチターゲット対応**
   - Poe APIが複数ターゲット対応していれば1回で済む
   - 実装の余地を残しておく

2. **キャッシュ戦略**
   - 同一メッセージの翻訳結果を短時間キャッシュ
   - 編集/再投稿時に再利用

3. **バッチ処理**
   - 高頻度チャンネルは複数メッセージをまとめて翻訳
   - Webhook経由でバッチリクエスト

4. **事前フィルタリング**
   - 翻訳不要条件の強化
   - URLのみ、短文、定型文などをスキップ

## リスクと対策

### リスク1: API呼び出しコスト増加

**影響**: 月額コストが約2倍に

**対策**:
- 初期段階ではモニタリング強化
- 使用量に応じて最適化を実施
- 必要に応じてキャッシュ戦略を導入

### リスク2: レスポンス時間の増加

**影響**: ユーザー体験の低下

**対策**:
- 並列実行により影響を最小化
- タイムアウト設定の調整
- 部分成功を許容し、1つでも成功すれば表示

### リスク3: Embed文字数制限

**影響**: 長文翻訳時に表示できない

**対策**:
- 文字数チェック機能を実装
- 必要に応じて2つのEmbedに分割
- 長文は省略表示 + 詳細ボタン（将来）

## 成功指標 (KPI)

1. **翻訳精度の向上**
   - ユーザーフィードバックによる評価
   - 誤訳の減少

2. **ユーザーエンゲージメント**
   - メッセージ数の増加
   - 翻訳機能の使用率

3. **システムパフォーマンス**
   - 平均レスポンス時間: 3秒以内
   - エラー率: 1%以下
   - 可用性: 99.9%以上

## タイムライン

| フェーズ | 期間 | 成果物 |
|---------|------|--------|
| Phase 3.1 | 1-2日 | multiTranslate実装 + テスト |
| Phase 3.2 | 1日 | MessageDispatcher拡張 |
| Phase 3.3 | 1日 | MessageHandler統合 + テスト |
| Phase 3.4 | 1日 | 最終テスト + デプロイ |
| **合計** | **4-5日** | **2言語同時翻訳機能完成** |

## 参考資料

- [Codexレビュー結果](../CODEX_REVIEW_PHASE3.md)
- [Discord Embed仕様](https://discord.com/developers/docs/resources/channel#embed-object)
- [Poe API ドキュメント](https://creator.poe.com/docs/quick-start)
- [プロジェクト憲法](../CLAUDE.md)

---

**最終更新**: 2025-10-19
**作成者**: Claude Code
**承認者**: (Codexレビュー後)
