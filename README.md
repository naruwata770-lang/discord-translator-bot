# Discord自動翻訳bot

Discordで中国人の友達と日本語⇔中国語で楽しくチャットするための自動翻訳bot。
Poe APIを使用してAI経由で高品質な翻訳を提供します。

## 特徴

- 🌏 **日本語⇔中国語の相互翻訳**
- 🤖 **AI翻訳エンジン**（Poe API経由）
- ⚡ **自動翻訳モード**（全メッセージを自動翻訳）
- 💬 **Embed形式**で見やすい翻訳結果
- 🔄 **自動言語検出**
- 🎮 **ON/OFF切り替え**（`!auto on/off`）
- 🚀 **Railway.appで24時間稼働**

## 使い方

### 自動翻訳モード

対象チャンネルにメッセージを送信すると、botが自動的に翻訳します：

```
👤 あなた: こんにちは！今日ゲームする？

🤖 bot（Embed形式）:
┌─────────────────────────┐
│ 💬 あなた               │
│ 你好！今天玩游戏吗？      │
│                         │
│ 🇯🇵→🇨🇳 自動翻訳         │
└─────────────────────────┘
```

### コントロールコマンド

```
!auto on      # 自動翻訳を有効化
!auto off     # 自動翻訳を無効化
!auto status  # 現在の状態を確認
```

---

## プロジェクトドキュメント

詳細なドキュメントは `docs/` フォルダにあります：

| ドキュメント | 説明 |
|-------------|------|
| [CLAUDE.md](./CLAUDE.md) | プロジェクト憲法（基本原則・開発方針） |
| [PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) | プロジェクト計画書（要件・スケジュール） |
| [TECHNICAL_SPECIFICATION.md](./docs/TECHNICAL_SPECIFICATION.md) | 技術仕様書（アーキテクチャ・API設計） |
| [IMPLEMENTATION_GUIDE.md](./docs/IMPLEMENTATION_GUIDE.md) | 実装ガイド（ディレクトリ構成・開発手順） |
| [DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) | デプロイ手順書（GitHub・Railway.app連携） |

---

## 技術スタック

- **言語**: TypeScript + Node.js 20+
- **Discord API**: discord.js v14
- **翻訳API**: Poe API（OpenAI互換）
- **設定管理**: zod（型安全なバリデーション）
- **ロガー**: pino（構造化ログ）
- **デプロイ**: Railway.app（自動デプロイ）

---

## クイックスタート

### 前提条件

- Node.js 20.x以上
- Discord Bot Token
- Poe API Key

### インストール

```bash
# リポジトリクローン
git clone https://github.com/YOUR_USERNAME/discord-translator-bot.git
cd discord-translator-bot

# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .envを編集してAPIキー・トークンを設定
```

### 開発モード起動

```bash
npm run dev
```

### 本番ビルド

```bash
npm run build
npm start
```

---

## 環境変数

`.env`ファイルで以下の環境変数を設定してください：

```bash
# Discord設定
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TARGET_CHANNELS=1234567890,0987654321

# Poe API設定
POE_API_KEY=your_poe_api_key_here
POE_ENDPOINT_URL=https://api.poe.com/v1/chat/completions
POE_MODEL_NAME=Claude-3.5-Sonnet

# レート制限設定
RATE_LIMIT_CONCURRENT=1
RATE_LIMIT_INTERVAL=1000

# ログレベル
LOG_LEVEL=info
NODE_ENV=development
```

詳細は [.env.example](./.env.example) を参照してください。

---

## デプロイ

### Railway.appへのデプロイ

詳細は [DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) を参照してください。

1. GitHubリポジトリ作成
2. Railway.appアカウント作成
3. GitHubリポジトリと連携
4. 環境変数設定
5. 自動デプロイ

---

## プロジェクト構成

```
discord-translator-bot/
├── src/
│   ├── index.ts                    # エントリーポイント
│   ├── config/                     # 設定管理
│   ├── discord/                    # Discord統合
│   ├── services/                   # 翻訳サービス
│   ├── commands/                   # コマンド解析
│   ├── utils/                      # ユーティリティ
│   └── types/                      # 型定義
├── docs/                           # ドキュメント
├── tests/                          # テスト
├── .env.example                    # 環境変数サンプル
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

---

## 開発フェーズ

### ✅ Phase 0: プロジェクトセットアップ（完了）
- [x] ドキュメント整備
- [x] GitHub リポジトリ作成
- [x] 設計変更（自動翻訳+Embed形式）
- [x] Codexレビューによる設計修正

### ✅ Phase 1: MVP開発（完了）
#### 完了したコンポーネント（TDD）
- [x] プロジェクト初期化（package.json, tsconfig.json, Jest設定）
- [x] 型定義・エラークラス
- [x] LanguageDetector（言語自動検出）- 12テスト
- [x] CommandParser（!autoコマンド解析）- 13テスト
- [x] RateLimiter（レート制限）- 9テスト
- [x] Logger（pino構造化ログ）
- [x] ConfigStore（zod環境変数管理）
- [x] PoeApiClient（Poe API通信）- 10テスト
- [x] TranslationService（翻訳ロジック）- 12テスト
- [x] MessageDispatcher（Embed送信）- 10テスト
- [x] MessageHandler（自動翻訳ハンドラ）- 17テスト
- [x] DiscordClient（Discord統合）- 9テスト
- [x] index.ts（エントリーポイント）

**テスト結果:** 92/92テスト成功 ✅
**テストスイート:** 8/8成功 ✅
**ビルド:** 成功 ✅

#### Codexレビュー結果
- [x] Codexレビュー実施（4件の指摘事項を修正）
  - High: Rate limit設定のバリデーション修正
  - High: repliedUser: false追加
  - Medium: 英語など未対応言語の検出改善
  - Medium: 429エラーのRetry-After尊重

#### 動作確認
- [x] ローカルでの動作確認完了
  - 起動確認成功
  - 翻訳機能動作確認
  - コマンド動作確認

### ✅ Phase 2: デプロイ・運用（完了）
- [x] Railway.appへのデプロイ準備完了
- [x] Railway.appでの本番デプロイ成功
- [x] 本番運用開始

**ステータス**: 🚀 **本番稼働中**（Railway.app 24時間稼働）

---

## ライセンス

MIT

---

## コントリビューション

このプロジェクトは個人用ですが、改善提案は歓迎します。

---

## 参考

- [Discord.js公式ドキュメント](https://discord.js.org/)
- [Poe API公式ドキュメント](https://developer.poe.com/)
- [Railway.app公式ドキュメント](https://docs.railway.app/)

---

**作成者**: Claude Code + vibe coding
**最終更新**: 2025-10-18
**ステータス**: 🚀 本番稼働中
