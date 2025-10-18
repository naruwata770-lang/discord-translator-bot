# Claude Code Action 使い方ガイド

本プロジェクトでは、GitHub上でClaudeが自動的にコード実装やレビューを行うための`claude-code-action`を導入しています。

## 📋 目次

- [セットアップ完了内容](#セットアップ完了内容)
- [使い方](#使い方)
  - [1. Issueから自動実装](#1-issueから自動実装)
  - [2. PRの自動レビュー](#2-prの自動レビュー)
  - [3. コメントで質問・依頼](#3-コメントで質問依頼)
- [ワークフローの詳細](#ワークフローの詳細)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)

## セットアップ完了内容

以下が自動で設定されています:

- ✅ GitHub Appインストール済み
- ✅ `CLAUDE_CODE_OAUTH_TOKEN`シークレット設定済み
- ✅ 自動実装ワークフロー (`.github/workflows/claude-auto-implement.yml`)
- ✅ 自動レビューワークフロー (`.github/workflows/claude-auto-review.yml`)

## 使い方

### 1. Issueから自動実装

Claudeに機能を実装してもらう方法は3つあります:

#### 方法A: ラベルで起動

1. GitHub Issueを作成
2. ラベル `claude-implement` を付与
3. Claudeが自動で実装を開始

**例:**
```markdown
Title: 翻訳履歴機能の追加

Description:
ユーザーごとの翻訳履歴を保存・表示する機能を追加してください。

## 要件
- 最新100件の翻訳を記録
- `/history`コマンドで履歴表示
- JSON形式でデータ保存

## 技術仕様
- `src/history/`ディレクトリに実装
- discord.jsのコマンドとして実装
```

→ ラベル `claude-implement` を付けると自動実装開始

#### 方法B: アサインで起動

1. Issueを作成
2. `@claude[bot]`にアサイン
3. 自動実装開始

#### 方法C: コメントで起動

既存のIssueやコメントで:
```
@claude この機能を実装してください
```

### 2. PRの自動レビュー

PRを作成すると**自動的にClaudeがレビュー**します。

#### レビュー観点

Claudeは以下をチェック:
- ✅ TypeScriptの型安全性
- ✅ エラーハンドリング
- ✅ APIレート制限対策
- ✅ セキュリティ（APIキー管理など）
- ✅ コーディング規約（CLAUDE.md準拠）

#### mainブランチへのPR

`dev → main`のPRは特に厳格にレビューされます（本番リリース前チェック）。

#### レビューへの対応

レビューコメントに対して修正依頼:
```
@claude この指摘箇所を修正してください
```

→ Claudeが自動で修正コミット

### 3. コメントで質問・依頼

PRやIssueのコメントで`@claude`をメンションすると、様々な依頼が可能:

```
@claude このコードのパフォーマンスを改善できますか？
```

```
@claude エラーハンドリングを強化してください
```

```
@claude この関数の単体テストを書いてください
```

```
@claude README.mdを最新の実装に合わせて更新してください
```

## ワークフローの詳細

### claude-auto-implement.yml

**トリガー:**
- Issue に `claude-implement` ラベルが付与
- Issue が `@claude[bot]` にアサイン
- Issue コメントで `@claude` をメンション

**動作:**
1. Issue内容を分析
2. CLAUDE.mdの規約に従って実装
3. `claude/機能名`ブランチを作成
4. `dev`ブランチ向けのPRを作成

**設定:**
- 最大ターン数: 15
- モデル: claude-sonnet-4-5
- ベースブランチ: dev

### claude-auto-review.yml

**トリガー:**
- PRの作成・更新
- PRレビューコメントで `@claude` をメンション

**動作:**
1. PR差分を分析
2. CLAUDE.mdの品質基準でレビュー
3. 問題点と改善提案をコメント
4. （メンション時）指摘箇所を修正

**設定:**
- 最大ターン数: 10
- モデル: claude-sonnet-4-5

## ベストプラクティス

### 良いIssue/依頼の書き方

**❌ 悪い例:**
```
翻訳機能を追加して
```

**✅ 良い例:**
```markdown
## 概要
翻訳履歴機能を追加

## 要件
- ユーザーごとに翻訳履歴を保存
- `/history`コマンドで表示
- 最新100件まで保持

## 技術仕様
- `src/history/TranslationHistory.ts`を作成
- discord.jsのコマンドとして実装
- データはJSON形式でローカル保存

## 参考
既存の翻訳コマンド実装: src/commands/translate.ts
```

### Claudeの実装後にやること

1. **PR内容を確認**
   - 実装が要件を満たしているか
   - テストコードがあるか

2. **ローカルでテスト**
   ```bash
   git fetch origin
   git checkout claude/機能名
   npm install
   npm test
   npm run dev  # 動作確認
   ```

3. **問題があれば修正依頼**
   ```
   @claude テストが失敗しています。修正してください。

   エラー内容:
   [エラーログを貼り付け]
   ```

4. **問題なければマージ**
   ```bash
   gh pr merge --squash
   ```

## トラブルシューティング

### Claudeが反応しない

**原因:**
- ワークフローのトリガー条件を満たしていない
- GitHubのActions権限が不足

**解決策:**
1. `.github/workflows/`のYAMLファイルを確認
2. GitHub Settings → Actions → General → Workflow permissions が Read/Write になっているか確認

### 実装が期待と違う

**解決策:**
1. より詳細な要件をIssueに追記
2. 既存コードの参照先を明示
3. コメントで修正依頼:
   ```
   @claude 要件を追加しました。以下の点を修正してください:
   - [修正内容1]
   - [修正内容2]
   ```

### API コストが心配

**対策:**
- 重要なPRのみ自動レビューを有効化（ワークフローのif条件を調整）
- `claude_args`の`--max-turns`を減らす

```yaml
# 例: devブランチへのPRのみレビュー
if: github.base_ref == 'dev'
```

### セキュリティ上の注意

- `CLAUDE_CODE_OAUTH_TOKEN`は絶対に公開しない
- Publicリポジトリでは外部コントリビューターのPRに注意
- 本番環境の機密情報を含むコードには使用しない

## 参考リンク

- [claude-code-action公式ドキュメント](https://github.com/anthropics/claude-code-action)
- [Solutions Guide](https://github.com/anthropics/claude-code-action/blob/main/docs/solutions.md)
- プロジェクト憲法: [CLAUDE.md](/CLAUDE.md)

---

**質問や問題があれば、Issueを作成するか@claudeに直接聞いてみてください！**
