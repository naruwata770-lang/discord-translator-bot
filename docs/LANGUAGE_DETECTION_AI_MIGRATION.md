# AIベース言語検出への移行計画

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

## 提案：AIベースの言語検出

### アプローチ
既に使用しているPoe APIに言語検出も任せる。

### メリット
1. **高精度**: AIが文脈を理解して判定
2. **メンテナンス不要**: ルールの追加・修正が不要
3. **コスト増加なし**: 既存のAPI呼び出しに統合
4. **将来の拡張性**: 他言語への対応が容易

### デメリット
1. **LanguageDetectorが不要に**: 既存の実装が無駄になる
2. **テスト数の削減**: 言語検出のテストが不要に

---

## 実装設計

### 1. プロンプトの変更

#### 現在のプロンプト
```typescript
Translate the following text from ${sourceLanguage} to ${targetLanguage}.
Only output the translation, without any explanation or additional text.

Text: ${text}
```

#### 新しいプロンプト
```typescript
Detect the language of the following text and translate it:
- If the text is in Japanese, translate it to Chinese (Simplified)
- If the text is in Chinese, translate it to Japanese
- If the text is in any other language, do not translate and return "UNSUPPORTED_LANGUAGE"

Important: Only output the translation result. Do not include the detected language or any explanation.

Text: ${text}
```

### 2. アーキテクチャ変更

#### Before
```
MessageHandler
  → LanguageDetector.detect(text) → sourceLang
  → TranslationService.translate(text, sourceLang)
    → PoeApiClient.translate(text, sourceLang, targetLang)
```

#### After
```
MessageHandler
  → TranslationService.translate(text)
    → PoeApiClient.translateWithAutoDetect(text)
```

### 3. 変更が必要なファイル

#### 修正
- `src/services/poeApiClient.ts`
  - `translateWithAutoDetect()` メソッドを追加
  - 既存の `translate()` は残す（後方互換性のため）

- `src/services/translationService.ts`
  - LanguageDetectorの使用を削除
  - `translate()` メソッドを簡素化

- `src/discord/messageHandler.ts`
  - 変更なし（TranslationServiceのインターフェースは維持）

#### 削除候補（段階的に）
- `src/services/languageDetector.ts`（将来的に削除）
- `src/services/languageDetector.test.ts`（将来的に削除）

#### テスト修正
- `src/services/poeApiClient.test.ts`
  - `translateWithAutoDetect()` のテスト追加

- `src/services/translationService.test.ts`
  - 言語検出関連のテストを削除
  - 翻訳結果のテストに集中

---

## 実装手順

### Phase 1: 新機能の追加
1. `PoeApiClient.translateWithAutoDetect()` を実装
2. テストを追加
3. 全テストが通ることを確認

### Phase 2: TranslationServiceの移行
1. `TranslationService` を新しいメソッドに切り替え
2. LanguageDetectorの依存を削除
3. テストを修正

### Phase 3: クリーンアップ
1. LanguageDetectorの削除（コードは残してもよい）
2. 不要なテストの削除
3. ドキュメントの更新

---

## リスク管理

### リスク1: API応答形式の不安定性
**対策**: レスポンスに "UNSUPPORTED_LANGUAGE" が含まれる場合のハンドリング

### リスク2: 誤翻訳の増加
**対策**: 本番デプロイ前に十分なテスト

### リスク3: レート制限への影響
**対策**: 既存のRateLimiterで対応済み

---

## 後方互換性

### 段階的移行
1. まず新しい `translateWithAutoDetect()` を追加
2. 既存の `translate()` は残す
3. 問題がなければ、最終的に統合

### ロールバック計画
問題が発生した場合、`TranslationService` でLanguageDetectorを再度有効化するだけで元に戻せる。

---

## 成功基準

1. ✅ 全テストが通る
2. ✅ 「哦哦 要坏掉了 再、再多一点」が正しく翻訳される
3. ✅ 日本語→中国語、中国語→日本語の双方向翻訳が正常動作
4. ✅ 英語など未対応言語が適切にスキップされる

---

## 質問・検討事項

1. **LanguageDetectorを完全に削除すべきか？**
   - コードは残してフォールバック用に保持？
   - 完全に削除してシンプルに？

2. **プロンプトの調整**
   - 現在のプロンプトで十分か？
   - より明確な指示が必要か？

3. **エラーハンドリング**
   - AIが "UNSUPPORTED_LANGUAGE" を返さない場合の対処
   - 不適切な翻訳結果の検出

4. **パフォーマンス**
   - API呼び出し回数は変わらないが、プロンプトが長くなる
   - トークン消費の増加は許容範囲か？

---

**作成日**: 2025-10-18
**ステータス**: 計画中（Codexレビュー待ち）
