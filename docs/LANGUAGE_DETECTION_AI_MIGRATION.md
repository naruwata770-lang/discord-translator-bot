# AIベース言語検出への移行計画（改訂版）

## 背景

### 現状の問題
- ルールベースの言語検出には限界がある
- 漢字のみのテキストで誤検出が頻発
- 簡体字パターンのメンテナンスが困難
- 新しいエッジケースが次々と発見される

### 例
```
「哦哦 要坏掉了 再、再多一点」
→ 簡体字と日本語句読点が混在し、判定が困難
```

## 提案：ハイブリッドアプローチ（AI + ルールベースフォールバック）

### アプローチ
**主系統**: Poe APIによるAI言語検出 + 翻訳（単一呼び出し）
**副系統**: 既存のルールベース検出（フォールバック・検証用）

### メリット
1. **高精度**: AIが文脈を理解して判定
2. **高可用性**: Poe API障害時もルールベースで継続動作
3. **段階的移行**: リスクを抑えて本番検証が可能
4. **将来の拡張性**: 他言語への対応が容易

### リスクと対策
1. **LLM出力の不安定性**
   - 対策: 厳密な出力バリデーションとパース処理
   - 対策: Few-shotプロンプトで出力形式を安定化

2. **単一障害点（Poe API依存）**
   - 対策: ルールベース検出を常に並行稼働
   - 対策: フィーチャーフラグで即座に切り替え可能

3. **テストカバレッジの低下**
   - 対策: Poe APIモックを使った契約テストを追加
   - 対策: 既存の言語検出テストは残す

---

## 実装設計

### 1. プロンプトの設計（改訂版）

#### システムメッセージ
```typescript
You are a precise translation engine for Japanese and Chinese languages.
Your task is to detect the input language and translate accordingly.
You must follow the output format exactly.
```

#### ユーザープロンプト（Few-shot付き）
```typescript
Detect the language and translate:
- Japanese → Chinese (Simplified)
- Chinese → Japanese
- Other languages → output exactly "UNSUPPORTED_LANGUAGE"

Rules:
1. Output ONLY the translation text, no explanations
2. Do not echo the source text
3. Do not add markdown, quotes, or formatting
4. For mixed-language text, translate only JP/ZH parts

Examples:

Input: こんにちは
Output: 你好

Input: 你好
Output: こんにちは

Input: Hello World
Output: UNSUPPORTED_LANGUAGE

Input: 今日はいい天気ですね
Output: 今天天气很好呢

Input: 这个东西坏了
Output: これは壊れました

Now translate:
${text}
```

#### API設定
```typescript
{
  model: "Claude-3.5-Sonnet",
  temperature: 0,  // 確定的な出力
  max_tokens: 1000,
  stop: ["\n\n"]  // 余計な説明を防ぐ
}
```

### 2. アーキテクチャ変更（ハイブリッド方式）

#### フェーズ1: デュアルパス（並行稼働）
```
MessageHandler
  → TranslationService.translate(text)
    ├─ [AI Path] PoeApiClient.translateWithAutoDetect(text)
    │   ├─ Success → 翻訳結果を返す
    │   ├─ UNSUPPORTED_LANGUAGE → エラー
    │   └─ Failure → Fallback to Rule-based
    │
    └─ [Rule Path] LanguageDetector.detect(text) → sourceLang
        → PoeApiClient.translate(text, sourceLang, targetLang)
```

#### フェーズ2: AI優先（フィーチャーフラグ制御）
```typescript
// 環境変数で制御
USE_AI_DETECTION=true  // AI優先
USE_AI_DETECTION=false // ルールベース優先
```

#### フェーズ3: 完全移行後
```
MessageHandler
  → TranslationService.translate(text)
    → PoeApiClient.translateWithAutoDetect(text)
      ↓ (エラー時のみ)
      → LanguageDetector (フォールバック)
```

### 3. 変更が必要なファイル

#### 新規追加
- `src/config/env.schema.ts`
  - `USE_AI_DETECTION` フィーチャーフラグを追加

#### 修正
- `src/services/poeApiClient.ts`
  - `translateWithAutoDetect()` メソッドを追加
  - システムメッセージ対応
  - temperature=0、stop設定の追加
  - 出力バリデーション・パース処理の追加
  - 既存の `translate()` は**保持**（フォールバック用）

- `src/services/translationService.ts`
  - フィーチャーフラグによる分岐処理
  - AI検出失敗時のルールベースフォールバック
  - 検出方法のログ記録（モニタリング用）
  - **LanguageDetectorは保持**（削除しない）

- `src/discord/messageHandler.ts`
  - 変更なし（TranslationServiceのインターフェースは維持）

#### 保持（削除しない）
- `src/services/languageDetector.ts` ✅
  - フォールバック用に常に保持
  - テストも維持

#### テスト追加
- `src/services/poeApiClient.test.ts`
  - `translateWithAutoDetect()` の契約テスト
    - 正常な翻訳（日本語→中国語）
    - 正常な翻訳（中国語→日本語）
    - UNSUPPORTED_LANGUAGE応答
    - 不正な出力形式（余計な説明付き）のパース
    - タイムアウト処理

- `src/services/translationService.test.ts`
  - AI検出モードのテスト
  - フォールバック動作のテスト
  - フィーチャーフラグ切り替えのテスト

---

## 実装手順（改訂版）

### Phase 1: 基盤整備（dev ブランチ）
**目的**: フィーチャーフラグとスタブ実装の準備

1. **環境変数の追加**
   ```bash
   # .env.example に追加
   USE_AI_DETECTION=false  # デフォルトはルールベース
   ```

2. **env.schema.ts の更新**
   ```typescript
   USE_AI_DETECTION: z.boolean().default(false)
   ```

3. **エラークラスの追加**
   ```typescript
   // src/services/errors.ts (新規作成)
   export class UnsupportedLanguageError extends Error {
     constructor(message: string) {
       super(message);
       this.name = "UnsupportedLanguageError";
       // TypeScript→ES5/ES2016トランスパイル後のinstanceof問題を回避
       Object.setPrototypeOf(this, UnsupportedLanguageError.prototype);
     }
   }

   export class ValidationError extends Error {
     constructor(message: string) {
       super(message);
       this.name = "ValidationError";
       // TypeScript→ES5/ES2016トランスパイル後のinstanceof問題を回避
       Object.setPrototypeOf(this, ValidationError.prototype);
     }
   }
   ```

4. **PoeApiClient へのスタブメソッド追加**
   ```typescript
   // src/services/poeApiClient.ts
   async translateWithAutoDetect(text: string): Promise<string> {
     // Phase 2で実装予定のスタブ
     throw new Error("Not implemented yet - USE_AI_DETECTION must be false");
   }
   ```

5. **契約テストのスケルトン追加**
   ```typescript
   // src/services/poeApiClient.test.ts
   describe('translateWithAutoDetect', () => {
     // Phase 2で実装予定（現在はスキップ）
     test.todo('should translate Japanese to Chinese');
     test.todo('should translate Chinese to Japanese');
     test.todo('should throw UnsupportedLanguageError for English');
     test.todo('should skip filler lines and extract translation');
     test.todo('should throw ValidationError for English-only response');
     test.todo('should throw ValidationError for empty response');
     test.todo('should handle timeout');
   });
   ```

6. **エラークラスのテスト**
   ```typescript
   // src/services/errors.test.ts (新規作成)
   describe('Custom Error Classes', () => {
     it('UnsupportedLanguageError should work with instanceof', () => {
       const error = new UnsupportedLanguageError("test");
       expect(error instanceof UnsupportedLanguageError).toBe(true);
       expect(error instanceof Error).toBe(true);
       expect(error.name).toBe("UnsupportedLanguageError");
     });

     it('ValidationError should work with instanceof', () => {
       const error = new ValidationError("test");
       expect(error instanceof ValidationError).toBe(true);
       expect(error instanceof Error).toBe(true);
       expect(error.name).toBe("ValidationError");
     });
   });
   ```

7. **確認**
   - `npm test` が全て通ることを確認
     - エラークラスのテスト: 通る（実装済み）
     - `translateWithAutoDetect`: スキップ（test.todo）
   - `git commit -m "feat: add USE_AI_DETECTION feature flag and stubs"`

### Phase 2: AI検出機能の実装（dev ブランチ）
**目的**: AI言語検出 + 翻訳メソッドの追加

1. **PoeApiClient.translateWithAutoDetect() の実装**
   ```typescript
   async translateWithAutoDetect(text: string): Promise<string> {
     const systemMessage = "You are a precise translation engine...";
     const userPrompt = `Detect the language and translate...\n\nNow translate:\n${text}`;

     const response = await this.makeRequest({
       model: this.config.model,
       messages: [
         { role: "system", content: systemMessage },
         { role: "user", content: userPrompt }
       ],
       temperature: 0,
       max_tokens: 1000,
       stop: ["\n\n"]
     });

     // バリデーション: 既知のフィラー文をスキップして最初の有効な行を取得
     const lines = response.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);

     // フィラー文のパターン（英語の説明文など）
     const FILLER_PATTERNS = [
       /^(Sure|Here|Okay|Alright|OK)[,\s]/i,
       /^(Translation|Translated|Result)[:\s]/i,
       /^(The translation is|Here's the translation)[:\s]/i,
     ];

     // 最初の有効な翻訳結果を探す
     let result = '';
     for (const line of lines) {
       // フィラー文をスキップ
       if (FILLER_PATTERNS.some(pattern => pattern.test(line))) {
         continue;
       }

       // 見つかった最初の非フィラー行を採用
       result = line;
       break;
     }

     // プレフィックスの除去（残存している場合）
     if (result.includes(':')) {
       const colonIndex = result.indexOf(':');
       const potentialPrefix = result.substring(0, colonIndex).trim();
       // プレフィックスが短い（5文字以内）場合は除去
       if (potentialPrefix.length <= 5 && /^[A-Za-z\s]+$/.test(potentialPrefix)) {
         result = result.substring(colonIndex + 1).trim();
       }
     }

     // UNSUPPORTED_LANGUAGEの特別処理
     if (result === "UNSUPPORTED_LANGUAGE") {
       throw new UnsupportedLanguageError("Language not supported by AI detection");
     }

     // 空の結果、または英語のみの結果はバリデーションエラー
     if (!result || result.length === 0) {
       throw new ValidationError("AI returned empty translation");
     }

     // 結果が英語のみ（日本語・中国語の文字を含まない）の場合はバリデーションエラー
     const hasJapaneseChinese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(result);
     if (!hasJapaneseChinese) {
       throw new ValidationError(`AI returned non-Japanese/Chinese text: ${result}`);
     }

     return result;
   }
   ```

2. **TranslationService の分岐ロジック実装**
   ```typescript
   async translate(text: string): Promise<TranslationResult> {
     if (this.config.useAiDetection) {
       try {
         const translated = await this.poeClient.translateWithAutoDetect(text);
         this.logger.info("AI detection succeeded", {
           method: 'ai',
           textLength: text.length
         });
         return { translatedText: translated, method: 'ai' };
       } catch (error) {
         // UNSUPPORTED_LANGUAGEは再スローしてメッセージスキップ
         if (error instanceof UnsupportedLanguageError) {
           this.logger.info("Unsupported language detected by AI", { text });
           throw error;  // フォールバックせずにエラーを伝播
         }

         // その他のエラー（ValidationError、タイムアウトなど）はフォールバック
         this.logger.warn("AI detection failed, falling back to rule-based", {
           error: error.message,
           errorType: error.name
         });
         // フォールバックへ
       }
     }

     // ルールベース検出
     const sourceLang = this.languageDetector.detect(text);
     if (sourceLang === 'unknown') {
       throw new UnsupportedLanguageError("Language not supported by rule-based detection");
     }
     // ... 既存ロジック
   }
   ```

3. **テストの実装**
   ```typescript
   // src/services/poeApiClient.test.ts
   describe('translateWithAutoDetect', () => {
     it('should translate Japanese to Chinese', async () => {
       mockPoeResponse('你好');
       const result = await client.translateWithAutoDetect('こんにちは');
       expect(result).toBe('你好');
     });

     it('should translate Chinese to Japanese', async () => {
       mockPoeResponse('こんにちは');
       const result = await client.translateWithAutoDetect('你好');
       expect(result).toBe('こんにちは');
     });

     it('should throw UnsupportedLanguageError for English', async () => {
       mockPoeResponse('UNSUPPORTED_LANGUAGE');
       await expect(client.translateWithAutoDetect('Hello')).rejects.toThrow(UnsupportedLanguageError);
     });

     it('should skip filler lines and extract translation', async () => {
       mockPoeResponse('Sure, here is the translation:\n你好');
       const result = await client.translateWithAutoDetect('こんにちは');
       expect(result).toBe('你好');
     });

     it('should throw ValidationError for English-only response', async () => {
       mockPoeResponse('Sure, here you go');
       await expect(client.translateWithAutoDetect('こんにちは')).rejects.toThrow(ValidationError);
     });

     it('should throw ValidationError for empty response', async () => {
       mockPoeResponse('');
       await expect(client.translateWithAutoDetect('こんにちは')).rejects.toThrow(ValidationError);
     });

     it('should handle timeout', async () => {
       mockPoeTimeout();
       await expect(client.translateWithAutoDetect('こんにちは')).rejects.toThrow();
     });
   });
   ```

4. **E2Eテスト・統合テスト**
   - `USE_AI_DETECTION=true` でのE2Eテスト追加
   - `UnsupportedLanguageError`のエラーハンドリングテスト
   - フォールバック動作のテスト

5. **確認**
   - 全テスト通過（新規追加: 20件以上）
   - 新規コードカバレッジ > 90%
   - `git commit -m "feat: implement AI-based language detection"`

### Phase 3: 本番検証（feature フラグでロールアウト）
**目的**: 本番環境でのAI検出の段階的検証

1. **Railway.app でフィーチャーフラグを有効化**
   ```bash
   # Railway.app の環境変数で設定
   USE_AI_DETECTION=true
   ```

2. **モニタリング**
   - Railwayのログで以下を監視：
     - AI検出の成功率
     - フォールバック発生頻度
     - 翻訳品質（ユーザーフィードバック）

3. **問題発生時の即座ロールバック**
   ```bash
   # Railway.app で即座に切り替え
   USE_AI_DETECTION=false
   ```

4. **成功基準を満たした場合**
   - 1週間の本番運用で問題なし
   - AI検出成功率 > 95%
   - フォールバック頻度 < 5%

### Phase 4: クリーンアップ（オプション）
**目的**: ルールベース検出の廃止（慎重に判断）

**⚠️ 注意**: Phase 3 で十分な実績を積んでから検討

1. **検討事項**
   - LanguageDetector を完全削除するか？
   - フォールバック用に保持するか？

2. **削除する場合**
   - `LanguageDetector` クラスの削除
   - 関連テストの削除
   - `TranslationService` からの依存削除

3. **保持する場合（推奨）**
   - コードはそのまま保持
   - フォールバック機構として継続利用
   - 将来のPoe API障害に備える

---

## リスク管理（詳細版）

### リスク1: LLM出力の不安定性 🔴 HIGH
**問題**:
- Poe APIは `strict: true` を無視するため、スキーマ保証がない
- LLMが指示に従わず、余計な説明や不正な形式で返す可能性

**対策**:
1. **Few-shotプロンプト**: 5つの具体例で出力形式を安定化
2. **temperature=0**: 確定的な出力を促す
3. **stop sequences**: `["\n\n"]` で余計な説明を防ぐ
4. **厳密なバリデーション**:
   ```typescript
   // フィラー文をスキップして最初の有効な翻訳結果を抽出
   const FILLER_PATTERNS = [
     /^(Sure|Here|Okay|Alright|OK)[,\s]/i,
     /^(Translation|Translated|Result)[:\s]/i,
     /^(The translation is|Here's the translation)[:\s]/i,
   ];

   const lines = response.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
   let result = '';
   for (const line of lines) {
     if (FILLER_PATTERNS.some(pattern => pattern.test(line))) {
       continue;  // フィラー文をスキップ
     }
     result = line;
     break;
   }

   // 英語のみの結果はValidationError
   const hasJapaneseChinese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(result);
   if (!hasJapaneseChinese) {
     throw new ValidationError("AI returned non-Japanese/Chinese text");
   }
   ```
5. **フォールバック**: バリデーション失敗時は即座にルールベースへ

**検証方法**:
- 契約テストで不正な出力パターンをモック
- 本番ログでバリデーション失敗率を監視

### リスク2: 単一障害点（Poe API依存）🔴 HIGH
**問題**:
- Poe API障害時に翻訳機能が完全停止
- レート制限超過時の対処

**対策**:
1. **デュアルパス設計**: AI検出とルールベース検出を並行稼働可能に
2. **フィーチャーフラグ**: 環境変数で即座に切り替え可能
3. **自動フォールバック**: AI失敗時は自動的にルールベースへ
4. **レート制限**: 既存の `RateLimiter` で対応済み

**ロールバック手順**:
```bash
# Railway.app で環境変数を変更（再デプロイ不要）
USE_AI_DETECTION=false
```

### リスク3: テストカバレッジの低下 🟡 MEDIUM
**問題**:
- LLMの振る舞いは非決定的でテストが難しい
- モックテストだけでは本番の問題を検出できない

**対策**:
1. **契約テスト**: Poe APIのモックを使用
   - 正常系: 各言語ペアの翻訳
   - 異常系: UNSUPPORTED_LANGUAGE、タイムアウト、不正形式
2. **既存テスト保持**: LanguageDetector のテストは削除しない
3. **E2Eテスト**: 実際のPoe APIを使った統合テスト（開発環境のみ）
4. **本番モニタリング**: ログベースの動作確認

### リスク4: 誤翻訳の増加 🟡 MEDIUM
**問題**:
- LLMが文脈を誤解して誤訳する可能性
- ルールベースより精度が高いとは限らない

**対策**:
1. **並行稼働**: 初期はAI検出とルールベース検出の両方でログ記録
2. **比較分析**: 両者の結果を比較してAIの精度を検証
3. **ユーザーフィードバック**: Discord上でユーザーからの報告を収集
4. **段階的ロールアウト**: フィーチャーフラグで一部のチャンネルから試験運用

### リスク5: パフォーマンス劣化 🟢 LOW
**問題**:
- プロンプトが長くなることでAPI応答時間が増加
- トークン消費の増加によるコスト増

**対策**:
1. **API呼び出し回数**: 変わらない（言語検出+翻訳の2回 → 1回に統合）
2. **プロンプト最適化**: Few-shot例を最小限に抑える
3. **max_tokens制限**: 1000トークンで十分
4. **モニタリング**: Railway.appのログで応答時間を監視

---

## 後方互換性とロールバック戦略

### 段階的移行の設計
1. **新旧メソッドの共存**
   - `translateWithAutoDetect()`: 新しいAI検出メソッド
   - `translate()`: 既存のルールベース検出（保持）

2. **インターフェース不変**
   - `TranslationService.translate()` のシグネチャは変更なし
   - MessageHandler の変更不要

3. **データ互換性**
   - ログ形式の拡張（検出方法を記録）
   - 既存のログ解析ツールは引き続き動作

### ロールバック計画（3段階）

#### レベル1: 即座切り替え（5分以内）
**トリガー**: AI検出の成功率が急低下（< 80%）

```bash
# Railway.app で環境変数を変更
USE_AI_DETECTION=false
# → 即座にルールベース検出に切り替わる（再デプロイ不要）
```

#### レベル2: コードロールバック（15分以内）
**トリガー**: 重大なバグ発見、予期しない動作

```bash
# Git で前のバージョンにロールバック
git revert <commit-hash>
git push origin main
# → Railway.app が自動再デプロイ
```

#### レベル3: 完全ロールバック（30分以内）
**トリガー**: システム全体の障害

```bash
# 最新の安定版タグにリセット
git reset --hard v1.0.2
git push --force origin main
# → Railway.app が自動再デプロイ
```

---

## 成功基準（定量的指標）

### 必須基準（Phase 2完了時）
1. ✅ **全テスト通過**: 既存テスト + 新規追加テスト（20件以上）
2. ✅ **契約テスト**: `translateWithAutoDetect()` の全ケース通過
   - 正常系: 日本語→中国語、中国語→日本語（各3ケース）
   - 異常系: UNSUPPORTED_LANGUAGE、ValidationError、タイムアウト（各2ケース）
   - エラーハンドリング: UnsupportedLanguageErrorの伝播（1ケース）
3. ✅ **既存機能維持**: ルールベース検出が引き続き動作
4. ✅ **カバレッジ**: 新規追加コードのカバレッジ > 90%（絶対値ではなく増分で評価）

### 本番検証基準（Phase 3完了時）
1. ✅ **AI検出成功率**: > 95%（1週間の平均）
2. ✅ **フォールバック頻度**: < 5%（API障害を除く）
3. ✅ **応答時間**: 平均 < 3秒（現状と同等）
4. ✅ **エッジケース解決**: 「哦哦 要坏掉了 再、再多一点」が正しく翻訳される
5. ✅ **双方向翻訳**: 日本語↔中国語の双方向で正常動作
6. ✅ **未対応言語**: 英語などが適切にスキップされる
7. ✅ **ユーザー満足度**: 誤訳報告 < 3件/週

### 最終移行基準（Phase 4検討時）
1. ✅ **長期安定性**: 1ヶ月間、重大な問題なし
2. ✅ **AI優位性**: ルールベースと比較して精度向上を定量的に確認
3. ✅ **コスト**: トークン消費の増加が予算内（月$10以下）

---

## モニタリング・観測性

### ログ項目の追加

**注意**: AIパスでは検出言語のメタデータが取得できないため、ログ項目を調整します。

```typescript
this.logger.info("Translation completed", {
  detectionMethod: "ai" | "rule-based",  // 検出方法
  detectedLanguage: "ja" | "zh" | "unknown" | "ai-inferred",  // 検出された言語
  // AI検出の場合は "ai-inferred"（言語は翻訳結果から推測不可）
  // ルールベースの場合は "ja" | "zh" | "unknown"
  fallbackUsed: boolean,  // フォールバック使用有無
  responseTime: number,  // 応答時間（ms）
  success: boolean,  // 成功/失敗
  textLength: number  // 入力テキストの長さ
});
```

**代替案（将来の検討）**: プロンプトを変更してメタデータを返す
```typescript
// プロンプトに構造化出力を追加（ただしPoe APIはstrictモードをサポートしないため不確実）
Output format:
LANG: ja|zh
TEXT: <translated text>
```

### 監視項目
1. **AI検出成功率**: `detectionMethod="ai" AND success=true` の割合
2. **フォールバック頻度**: `fallbackUsed=true` の発生回数
3. **応答時間**: `responseTime` の平均値・p95・p99
4. **エラー率**: `success=false` の割合
5. **検出方法の分布**: `detectionMethod` の内訳（ai / rule-based）
6. **テキスト長の分布**: `textLength` の統計（短文/長文での成功率の違いを分析）

### アラート設定（Railway.app）
- AI検出成功率 < 80%: WARNING
- フォールバック頻度 > 20%: WARNING
- エラー率 > 10%: CRITICAL
- 応答時間 p95 > 5秒: WARNING

---

## 未解決の質問・今後の検討事項

### 技術的検討
1. **Poe APIの構造化出力対応状況の変化**
   - 現状: `strict: true` は無視される
   - 将来: Poe APIが構造化出力をサポートした場合、プロンプト設計を見直す

2. **プロンプトの継続的改善**
   - Few-shot例の追加・削除による精度向上
   - temperature、stop sequencesの最適化

3. **多言語対応の拡張**
   - 現状: 日本語↔中国語のみ
   - 将来: 韓国語、英語などへの拡張可能性

### 運用面の検討
1. **LanguageDetectorの長期保持方針**
   - 案A: フォールバック用に永続保持（推奨）
   - 案B: 1年後に削除を検討
   - 案C: 完全削除してAI一本化

2. **コスト最適化**
   - プロンプト長の削減
   - キャッシング戦略（同じテキストの再翻訳を防ぐ）

3. **A/Bテストの導入**
   - AI検出 vs ルールベース検出の精度比較
   - ユーザーごとにランダムで振り分け

---

**作成日**: 2025-10-18
**最終更新**: 2025-10-18
**ステータス**: 第3回改訂完了（Codex最終承認待ち）

## 改訂履歴

### 第3回改訂（2025-10-18）
Codex第3回レビュー（3項目）を反映：

1. **🔴 High: バリデーション処理の全面強化**
   - フィラー文パターンのスキップ（"Sure, here's the translation:"など）
   - 複数行から最初の有効な翻訳結果を抽出
   - 英語のみの結果をValidationErrorとして扱う
   - 日本語・中国語の文字を含まない結果を検出

2. **🔴 High: `instanceof`問題の修正**
   - `Object.setPrototypeOf(this, UnsupportedLanguageError.prototype)` を追加
   - `Object.setPrototypeOf(this, ValidationError.prototype)` を追加
   - ES5/ES2016トランスパイル後も正しく動作するように修正

3. **🟡 Medium: Phase 1のテスト矛盾解消**
   - `translateWithAutoDetect()`のテストを`test.todo`に変更（Phase 2で実装）
   - エラークラスの`instanceof`テストを追加（Phase 1で実装・検証）
   - "npm test が全て通る"要件を達成

### 第2回改訂（2025-10-18）
Codex第2回レビュー（5項目）を反映：

1. **🔴 High: バリデーション処理の強化**
   - `translateWithAutoDetect()`に最初の行のみ取得するロジックを追加
   - "Translation:"プレフィックスの除去処理を追加
   - 空の結果をValidationErrorとして処理

2. **🔴 High: UNSUPPORTED_LANGUAGEの処理修正**
   - `UnsupportedLanguageError`として専用のエラークラスを導入
   - TranslationServiceでエラーの種類により分岐（フォールバック vs 再スロー）
   - 未対応言語はフォールバックせずにエラーを伝播

3. **🟡 Medium: Phase 1のテスト問題解決**
   - Phase 1でスタブメソッドを追加（コンパイルエラーを回避）
   - エラークラスをPhase 1で追加（テストで利用可能に）

4. **🟡 Medium: モニタリング計画の調整**
   - AIパスでは`detectedLanguage`を"ai-inferred"として記録
   - 将来の拡張案として構造化出力プロンプトを記載
   - `textLength`を追加して短文/長文での成功率を分析

5. **🟢 Low: テストカバレッジ基準の現実化**
   - 絶対値（"100テスト以上、80%"）から増分評価に変更
   - 新規追加テスト20件以上、新規コードカバレッジ > 90%

### 第1回改訂（2025-10-18）
Codex第1回レビュー（6項目）を反映：

1. **🔴 High: LLM出力のバリデーション**
   - Poe API構造化出力調査（`strict: true`は無視される）
   - Few-shot、temperature=0、stop sequencesによる安定化

2. **🔴 High: フォールバック機構**
   - ハイブリッドアプローチ（AI + ルールベース）採用
   - フィーチャーフラグとロールバック戦略の追加

3. **🟡 Medium: 契約テスト**
   - Phase 1での契約テスト準備を明記

4. **🟡 Medium: プロンプト設計**
   - システムメッセージ、Few-shot例、API設定を詳細化

5. **🟡 Medium: モニタリング・ロールバック**
   - ログ項目、監視項目、アラート設定を追加
   - 3段階ロールバック戦略（5分/15分/30分）

6. **🟢 Low: 後方互換性**
   - 新旧メソッド共存と段階的移行を明記
