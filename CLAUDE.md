# Discord自動翻訳bot - プロジェクト憲法

## プロジェクト概要

Discordで中国人の友達と日本語⇔中国語で楽しくチャットするための自動翻訳bot。
Poe APIを使用してAI経由で高品質な翻訳を提供し、言語の壁を超えたコミュニケーションを実現する。

## 基本原則

### コミュニケーション
- **日本語で応答する**: すべての開発コミュニケーション、ドキュメント、コメント、ユーザー向けメッセージは日本語で行う
- **Claude Codeとのvibe coding**: 開発はClaude Codeとの対話を通じて進める

### 開発手法
- **段階的な実装**: MVP（Minimum Viable Product）から始めて、段階的に機能を追加
- **実用性重視**: 理論より実際に動くものを優先
- **ドキュメント駆動**: 実装前に設計をドキュメント化し、方向性を明確にする
- **テスト開発駆動（TDD）**: 機能の実装よりも先にテストコードを書き、そのテストをクリアする最小限のコードを実装し、その後リファクタリングを行うという短いサイクルを繰り返す。

## 技術スタック

### 言語・フレームワーク
- **Node.js + TypeScript**: 非同期処理に強く、Discord botに最適
- **discord.js**: 最も人気のあるDiscord APIライブラリ
- **zod**: 型安全な設定管理とバリデーション

### API・外部サービス
- **Poe API**: AI翻訳エンジン（OpenAI互換API）
- **Discord Bot API**: Discordとの通信

### デプロイ環境
- **GitHub**: コード管理・バージョン管理
- **Railway.app**: 本番環境ホスティング（月$5程度）
- **Docker**: コンテナ化による環境の統一

## 品質基準

- **エラーハンドリング**: すべての非同期処理に適切な例外処理
- **ログ出力**: 構造化ログによるトラブルシューティング支援
- **レート制限**: Poe APIとDiscord APIの制限を遵守
- **セキュリティ**: APIキー・トークンの安全な管理

## ブランチ戦略

```
feature/* → dev → main
```

### ブランチの役割
- **main**: 本番リリース用ブランチ（安定版のみ）
  - 動作保証済みのコードのみをマージ
  - Phase完了時にdevからマージ

- **dev**: 開発統合ブランチ
  - 日常的な開発作業の統合先
  - Phase 0, 1, 2...の実装を順次統合

- **feature/\***: 個別機能開発ブランチ
  - 各機能・修正ごとに作成
  - devから分岐、devにマージ

## 開発支援ツール

### Codex MCP ツール
Codexは、もう一人のAIエージェントで、コーディングや設計を得意とする開発パートナーです。
以下の用途で活用してください：

- **コードレビュー**: 実装内容の品質確認とフィードバック
- **設計相談**: アーキテクチャやデザインパターンの相談
- **実装支援**: 複雑な機能の実装を並行して進める
- **壁打ち相手**: アイデアの検証や問題解決の相談

#### 使用方法
MCPツールとして、Claude Code内から直接呼び出し可能です。
- `mcp__codex__codex`: 新しいCodexセッションを開始
- `mcp__codex__codex-reply`: 既存のセッションで会話を継続

**重要な注意事項**:
- `mcp__codex__codex`呼び出し時は**モデル指定をしない**（デフォルト設定を使用）
- `config`パラメータで`model`を指定すると応答が返ってこない

### Claude Code Action (GitHub統合)
GitHub Issueから自動実装、PRレビューまでを自動化します。

#### Issue自動実装について
Issueに`claude-implement`ラベルを付けると:
- GitHub Actions上で別のClaude Codeが起動（`--dangerously-skip-permissions`で完全自動実行）
- Issueの要求に基づいてコード実装
- 新しいブランチを作成してPRを自動作成
- **環境変数なし**のサンドボックス環境で動作（セキュリティ確保）

#### GitHub Actions環境での安全ルール
**GitHub ActionsのClaude Codeが従うべき制約**:

✅ **変更可能範囲**:
- `src/`ディレクトリ内のTypeScriptファイル
- `docs/`ディレクトリ内のMarkdownファイル
- テストファイル（`__tests__/`, `*.test.ts`）

❌ **絶対に禁止**:
- APIキーやトークンをコード内にハードコードしない
- 環境変数(`process.env`)全体をログ出力しない
- `.env`ファイルを新規作成しない（環境変数を使用すること）
- `.gitignore`に含まれるファイルを新規作成してコミットしない
- `.github/workflows/`の変更（ワークフロー自己改変の禁止）
- `package.json`の依存関係変更（セキュリティリスク）

#### PR自動レビューについて
PRを作成すると:
- GitHub Actionsで別のClaude Codeが起動
- 本プロジェクトの品質基準（CLAUDE.md）に基づいてレビュー
- TypeScript型安全性、エラーハンドリング、セキュリティなどをチェック
- コメントで指摘・改善提案を受け取る

#### ワークフロー
- `.github/workflows/claude-auto-implement.yml`: Issue自動実装
- `.github/workflows/claude-auto-review.yml`: PR自動レビュー
- 詳細: [docs/CLAUDE_CODE_ACTION_GUIDE.md](/docs/CLAUDE_CODE_ACTION_GUIDE.md)

#### レビュープロセス

**ローカル開発時**:
1. 変更内容をCodexに提示してレビュー依頼
2. 修正指摘があれば対応してから再レビュー
3. テストが通ることを確認してコミット・プッシュ

**GitHub Actions自動実装時**:
1. Issue要求に基づいて実装
2. テストを実行して確認
3. 問題なければ直接PRを作成（Codexレビュー不要）
4. ローカルClaude CodeがPRレビューを実施

**PRマージまで**:
1. PRレビューコメントの指摘を確認
2. 必要に応じて追加修正
3. すべての指摘に対応完了後マージ

## ドキュメント構成

- `CLAUDE.md`: プロジェクト憲法（本ファイル）
- `README.md`: プロジェクト概要と利用方法
- `docs/`:
  - `PROJECT_PLAN.md`: プロジェクト計画書
  - `TECHNICAL_SPECIFICATION.md`: 技術仕様書
  - `IMPLEMENTATION_GUIDE.md`: 実装ガイド
  - `DEPLOYMENT_GUIDE.md`: デプロイ手順書
  - `CLAUDE_CODE_ACTION_GUIDE.md`: Claude Code Action使い方ガイド

## 開発フェーズ

### Phase 0: プロジェクトセットアップ
- ドキュメント整備
- GitHub リポジトリ作成
- 開発環境構築

### Phase 1: MVP開発
- Discord bot基本機能
- Poe API統合
- コマンドベース翻訳（`!translate`）

### Phase 2: 機能拡張
- 自動翻訳モード
- 言語自動検出
- エラーハンドリング強化

### Phase 3: デプロイ・運用
- Railway.appへのデプロイ
- モニタリング・ログ設定
- 本番運用開始

---

**この憲法に従って開発を進めること。判断に迷った時はこの原則に立ち戻る。**
