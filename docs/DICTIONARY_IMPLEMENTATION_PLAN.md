# 翻訳辞書機能 実装計画書

## 概要

Discord翻訳botにゲーム用語・固有名詞の翻訳精度を向上させる辞書機能を追加する。

## 背景

ゲーム友達との会話において、以下の課題がある：

1. **固有名詞の誤訳**: ゲーム名やキャラクター名が正しく翻訳されない
2. **略称の認識**: 「卡拉」を「ストリノヴァ」と認識できない
3. **スラング対応**: ゲーム用語やネットスラングが直訳されてしまう

## 解決方針

### 1. 辞書ベースの翻訳補助

- YAML形式の辞書ファイルで用語管理
- メッセージ中の用語を動的に検出
- マッチした用語のみをAIプロンプトに追加

### 2. トークン数の最適化

- ❌ **避ける**: 辞書全体をプロンプトに含める（トークン数爆発）
- ✅ **採用**: メッセージに含まれる用語のみを抽出してプロンプトに追加

### 3. 拡張性の確保

- 将来的なチャンネル別辞書対応を考慮した設計
- 英語対応の余地を残す（現時点では実装しない）

## 技術仕様

### 辞書フォーマット

詳細は [`DICTIONARY_FORMAT.md`](./DICTIONARY_FORMAT.md) を参照。

```yaml
entries:
  - id: strinova_game
    aliases:
      zh: [卡拉彼丘, 卡拉]
    targets:
      ja: ストリノヴァ
      zh: 卡拉彼丘
```

### アーキテクチャ

```
┌─────────────────┐
│ MessageHandler  │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐      ┌──────────────────┐
│ TranslationService  │─────→│ DictionaryService│
└────────┬────────────┘      └──────────────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐           ┌──────────────┐
│  PoeApiClient   │           │  YAML Files  │
└─────────────────┘           └──────────────┘
```

### クラス設計

#### DictionaryService

**責務**:
- YAML辞書ファイルの読み込み
- メッセージ中の用語マッチング
- AIプロンプト用の辞書情報生成

**メソッド**:
```typescript
class DictionaryService {
  // 辞書を読み込む
  loadDictionary(filePath: string): Dictionary;

  // メッセージから辞書エントリをマッチング
  findMatches(text: string, sourceLang: LanguageCode, targetLang: LanguageCode): DictionaryMatch[];

  // マッチした辞書エントリをプロンプト用テキストに変換
  generatePromptHint(matches: DictionaryMatch[]): string;
}
```

## 実装フェーズ

### Phase 1: DictionaryService基盤実装

**ブランチ**: `feature/dictionary-phase1`

**タスク**:
1. ✅ 型定義作成（`src/types/dictionary.ts`）
2. ✅ サンプル辞書作成（`dictionaries/strinova.yaml`）
3. ✅ ドキュメント作成
4. `DictionaryService`クラス実装
   - YAML読み込み（`js-yaml`使用）
   - バリデーション（スキーマチェック、重複検出）
   - エントリ検索（`findMatches`）
5. 単体テスト作成（TDD）
   - YAML読み込みテスト
   - バリデーションテスト
   - マッチングテスト（正規表現 vs 部分一致）

**成果物**:
- `src/services/dictionaryService.ts`
- `src/services/dictionaryService.test.ts`

**完了条件**:
- 全テストが合格
- Codexレビュー承認

---

### Phase 2: 翻訳サービスへの統合

**ブランチ**: `feature/dictionary-phase2`

**タスク**:
1. `TranslationService`に`DictionaryService`を注入
2. `translateWithAutoDetect()`でマッチング実行
3. マッチした辞書エントリをプロンプトに追加
4. 統合テスト作成
5. E2Eテスト（実際の翻訳動作確認）

**成果物**:
- `src/services/translationService.ts`（更新）
- `src/services/translationService.test.ts`（更新）
- `src/index.ts`（DI設定更新）

**完了条件**:
- 全テストが合格
- 実際の翻訳で辞書が反映されることを確認
- Codexレビュー承認

---

### Phase 3: 環境変数対応と本番投入

**ブランチ**: `feature/dictionary-phase3`

**タスク**:
1. 環境変数で辞書ファイルパスを指定
   - `DICTIONARY_FILE=dictionaries/strinova.yaml`
2. `.env.example`更新
3. Railway.appデプロイ手順書更新
4. 本番環境での動作確認

**成果物**:
- `src/config/env.schema.ts`（更新）
- `.env.example`（更新）
- `docs/RAILWAY_DEPLOYMENT.md`（更新）

**完了条件**:
- Railway.appで正常動作
- 実際のゲーム会話で翻訳精度向上を確認

---

## Git戦略

### ブランチフロー

```
main (v2.0.0 - AI detection)
  ↑
develop
  ↑
feature/dictionary-phase1 ← まずここから
  │
  ├─ (開発・テスト・Codexレビュー)
  │
  ▼
develop ← マージ後、Phase 2へ
  ↑
feature/dictionary-phase2
  │
  ├─ (開発・テスト・Codexレビュー)
  │
  ▼
develop ← マージ後、Phase 3へ
  ↑
feature/dictionary-phase3
  │
  ├─ (開発・テスト・本番確認)
  │
  ▼
develop
  ▼
main (v2.1.0 - Dictionary support) ← リリース
```

### コミットメッセージ規約

```
feat: 新機能追加
test: テスト追加
docs: ドキュメント更新
refactor: リファクタリング
fix: バグ修正
```

### レビュープロセス

各Phaseの完了時：
1. 全テストが合格することを確認
2. Codexにレビュー依頼
3. 指摘事項を修正
4. 再レビュー → 承認
5. developブランチにマージ
6. 次のPhaseへ

---

## テスト戦略

### 単体テスト（Phase 1）

#### DictionaryService.loadDictionary()
- ✅ 正常なYAMLファイルを読み込める
- ❌ 存在しないファイルパスでエラー
- ❌ 不正なYAML構文でエラー
- ❌ 必須フィールド欠落でエラー
- ❌ 重複IDでエラー

#### DictionaryService.findMatches()
- ✅ 完全一致で辞書エントリを検出
- ✅ 部分一致で辞書エントリを検出
- ✅ 複数エントリのマッチ
- ✅ エイリアス（略称）でマッチ
- ✅ マッチしない場合は空配列
- ✅ 大文字小文字の扱い
- ✅ 言語方向の考慮（ja→zh, zh→ja）

#### DictionaryService.generatePromptHint()
- ✅ マッチ1件の場合のプロンプト生成
- ✅ マッチ複数件の場合のプロンプト生成
- ✅ マッチ0件の場合は空文字列

### 統合テスト（Phase 2）

- ✅ 辞書エントリを含むメッセージの翻訳
- ✅ 辞書エントリを含まないメッセージの翻訳（通常動作）
- ✅ 複数の辞書エントリを含むメッセージの翻訳
- ✅ エイリアス（略称）を含むメッセージの翻訳

### E2Eテスト（Phase 3）

- ✅ 実際のDiscordメッセージで辞書が適用される
- ✅ 環境変数で辞書を切り替えられる
- ✅ 辞書ファイルが存在しない場合でもクラッシュしない（フォールバック）

---

## マイルストーン

| Phase | 期間（目安） | 完了条件 |
|-------|-------------|----------|
| Phase 1 | 2-3時間 | DictionaryService実装完了、全テスト合格、Codexレビュー承認 |
| Phase 2 | 1-2時間 | TranslationService統合完了、全テスト合格、Codexレビュー承認 |
| Phase 3 | 1時間 | Railway.appデプロイ成功、本番動作確認 |

---

## リスクと対策

### リスク1: トークン数増加

**リスク**: 辞書エントリが多いとプロンプトが長くなりすぎる

**対策**:
- マッチした辞書エントリのみをプロンプトに追加（全辞書を送らない）
- マッチ数が多い場合は上位N件に制限（例: 最大5件）

### リスク2: マッチング精度

**リスク**: 意図しない単語がマッチしてしまう

**対策**:
- 完全一致を優先、部分一致は慎重に
- カテゴリによるフィルタリング（将来対応）

### リスク3: 辞書メンテナンス

**リスク**: 辞書の更新にはGit push + 再デプロイが必要

**対策**:
- 現状は許容する（簡単な運用）
- 将来的にはDiscordコマンドでの動的更新を検討（Phase 4以降）

---

## 将来の拡張（現時点では実装しない）

### チャンネル別辞書

```bash
# 環境変数例
CHANNEL_1429004524718395473_DICTIONARY=dictionaries/strinova.yaml
CHANNEL_1428075046391517186_DICTIONARY=dictionaries/apex.yaml
```

### 動的辞書編集

```
!dict add 卡拉 ストリノヴァ
!dict remove strinova_game
!dict list
```

### 辞書優先度

複数の辞書がマッチした場合の優先順位制御

---

## 参考資料

- [辞書フォーマット仕様](./DICTIONARY_FORMAT.md)
- [プロジェクト計画書](./PROJECT_PLAN.md)
- [技術仕様書](./TECHNICAL_SPECIFICATION.md)

---

**この計画に従って、TDD開発を進めること。各Phase完了時にはCodexレビューを必ず実施する。**
