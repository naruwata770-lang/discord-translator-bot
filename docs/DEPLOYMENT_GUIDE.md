# Discord自動翻訳bot - デプロイ手順書

## デプロイ概要

このガイドでは、Discord自動翻訳botをGitHub + Railway.appを使って本番環境にデプロイする手順を説明します。

### デプロイフロー

```
ローカル開発 → GitHub → Railway.app → 本番稼働
     ↓           ↓          ↓
   git push   自動連携   自動デプロイ
```

---

## 前提条件

### 必要なアカウント

1. **GitHubアカウント**
   - URL: https://github.com/
   - プライベートリポジトリが使用可能

2. **Railway.appアカウント**
   - URL: https://railway.app/
   - GitHubアカウントで連携可能
   - クレジットカード登録が必要（月$5程度）

3. **Discord Developer Portal**
   - URL: https://discord.com/developers/applications
   - Bot Tokenの取得

4. **Poe API**
   - URL: https://poe.com/
   - API Keyの取得

---

## Phase 0: 事前準備

### 1. Discord Bot作成

#### 1-1. Discord Developer Portalにアクセス

https://discord.com/developers/applications

#### 1-2. 新しいアプリケーション作成

1. 「New Application」をクリック
2. アプリケーション名を入力（例: `Discord Translator Bot`）
3. 「Create」をクリック

#### 1-3. Bot設定

1. 左メニューから「Bot」を選択
2. 「Add Bot」をクリック
3. 「Reset Token」をクリックしてBot Tokenをコピー（後で使用）

#### 1-4. Intent設定

1. 「Privileged Gateway Intents」セクションで以下を有効化:
   - ✅ `MESSAGE CONTENT INTENT`
   - ✅ `SERVER MEMBERS INTENT`（オプション）

#### 1-5. Bot招待URL生成

1. 左メニューから「OAuth2」→「URL Generator」
2. **SCOPES**:
   - ✅ `bot`
3. **BOT PERMISSIONS**:
   - ✅ `Read Messages/View Channels`
   - ✅ `Send Messages`
   - ✅ `Read Message History`
4. 生成されたURLをコピーしてブラウザで開く
5. Botを招待するサーバーを選択

### 2. Poe API Key取得

#### 2-1. Poeにログイン

https://poe.com/

#### 2-2. API設定ページへ

1. 右上のユーザーアイコン → 「Settings」
2. 「API」タブを選択
3. 「Create API Key」をクリック
4. API Keyをコピー（後で使用）

### 3. 対象チャンネルID取得

#### 3-1. Discord Developer Modeを有効化

1. Discordアプリで「設定」→「詳細設定」→「開発者モード」を有効化

#### 3-2. チャンネルIDをコピー

1. 翻訳対象のチャンネルを右クリック
2. 「IDをコピー」を選択
3. IDをメモ（複数ある場合はカンマ区切り）

---

## Phase 1: GitHubリポジトリ作成

### 1. GitHubアカウント作成（未所持の場合）

https://github.com/signup

### 2. 新しいリポジトリ作成

#### 2-1. GitHubにログイン後、右上の「+」→「New repository」

#### 2-2. リポジトリ情報入力

- **Repository name**: `discord-translator-bot`（任意）
- **Description**: Discord自動翻訳bot（日本語⇔中国語）
- **Visibility**:
  - ✅ `Private`（推奨: APIキー等を含むため）
  - または `Public`（公開する場合）
- **Initialize this repository with**:
  - ✅ Add a README file
  - ✅ Add .gitignore (Node を選択)

#### 2-3. 「Create repository」をクリック

### 3. ローカルリポジトリとGitHubを連携

#### 3-1. ローカルでgit初期化

```bash
cd /workspace
git init
git branch -M main
```

#### 3-2. .gitignoreを確認

```bash
cat .gitignore
# .envが含まれていることを確認（APIキー漏洩防止）
```

#### 3-3. リモートリポジトリを追加

```bash
# GitHubのリポジトリURLを使用
git remote add origin https://github.com/YOUR_USERNAME/discord-translator-bot.git
```

#### 3-4. 初回コミット&プッシュ

```bash
git add .
git commit -m "Initial commit: project setup and documentation"
git push -u origin main
```

**注意**: GitHubへのプッシュ時に認証が必要です。Personal Access Token（PAT）を使用してください。

#### Personal Access Token（PAT）の作成方法

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 「Generate new token」→「Generate new token (classic)」
3. スコープ選択:
   - ✅ `repo`（全てのリポジトリアクセス）
4. 「Generate token」をクリック
5. トークンをコピー（再表示不可なので注意）
6. プッシュ時のパスワードとして使用

---

## Phase 2: Railway.appデプロイ

### 1. Railway.appアカウント作成

https://railway.app/

1. 「Login」をクリック
2. 「Login with GitHub」を選択
3. GitHubアカウントで認証

### 2. 新しいプロジェクト作成

#### 2-1. ダッシュボードで「New Project」

#### 2-2. 「Deploy from GitHub repo」を選択

#### 2-3. リポジトリ選択

- 先ほど作成した`discord-translator-bot`を選択
- Railway.appにGitHubリポジトリへのアクセス権限を付与

#### 2-4. デプロイ設定

- **Start Command**: `npm start`
- **Build Command**: `npm run build`（自動検出される）

### 3. 環境変数設定

#### 3-1. プロジェクトダッシュボードで「Variables」タブ

#### 3-2. 環境変数を追加

| Variable Name | Value | 備考 |
|--------------|-------|------|
| `DISCORD_BOT_TOKEN` | `YOUR_BOT_TOKEN` | Discord Developer Portalで取得 |
| `TARGET_CHANNELS` | `123456,789012` | カンマ区切りのチャンネルID |
| `POE_API_KEY` | `YOUR_POE_API_KEY` | Poeで取得 |
| `POE_ENDPOINT_URL` | `https://api.poe.com/v1/chat/completions` | デフォルト |
| `POE_MODEL_NAME` | `Claude-3.5-Sonnet` | 使用するモデル |
| `RATE_LIMIT_CONCURRENT` | `1` | 同時リクエスト数 |
| `RATE_LIMIT_INTERVAL` | `1000` | 最小間隔（ミリ秒） |
| `LOG_LEVEL` | `info` | ログレベル |
| `NODE_ENV` | `production` | 本番環境 |

#### 3-3. 「Add」で保存

### 4. デプロイ実行

環境変数設定後、自動的にデプロイが開始されます。

#### デプロイ状況確認

1. 「Deployments」タブでビルドログを確認
2. ビルド成功 → ✅ `Success`
3. ビルド失敗 → ログでエラーを確認

### 5. 動作確認

#### 5-1. ログ確認

Railway.app「Logs」タブで以下を確認:

```
Starting Discord Translation Bot...
Bot logged in as YourBotName#1234
Bot is now running
```

#### 5-2. Discordで動作テスト

対象チャンネルで以下を入力:

```
!translate こんにちは
```

botが以下のように返信すること:

```
🇯🇵→🇨🇳
你好
```

---

## Phase 3: 運用・メンテナンス

### 自動デプロイ設定

Railway.appはGitHub連携により、`main`ブランチへのpush時に自動デプロイされます。

#### デプロイフロー

```bash
# ローカルで開発
git checkout -b feature/new-feature

# 実装 & テスト
npm run dev

# コミット
git add .
git commit -m "Add new feature"

# devブランチにマージ
git checkout dev
git merge feature/new-feature
git push origin dev

# mainにマージ（本番デプロイ）
git checkout main
git merge dev
git push origin main
# → Railway.appが自動デプロイ
```

### ログ監視

#### Railway.appダッシュボード

- 「Logs」タブでリアルタイムログ確認
- エラー発生時は通知設定も可能

#### ログレベル調整

```bash
# Railway.appの環境変数を変更
LOG_LEVEL=debug  # より詳細なログ
LOG_LEVEL=warn   # 警告以上のみ
```

### トラブルシューティング

#### Bot起動失敗

**症状**: Railway.appで起動直後にクラッシュ

**原因チェック**:
1. 環境変数が正しく設定されているか
2. Discord Bot Tokenが正しいか
3. Poe API Keyが正しいか

**対処**:
```bash
# ログで詳細確認
LOG_LEVEL=debug
```

#### 翻訳が返ってこない

**症状**: `!translate`コマンドに反応しない

**原因チェック**:
1. botが対象チャンネルを監視しているか
2. `TARGET_CHANNELS`が正しく設定されているか
3. Poe APIのレート制限に達していないか

**対処**:
```bash
# 全チャンネル対象にする（テスト用）
TARGET_CHANNELS=  # 空にする
```

#### API制限エラー

**症状**: `Rate limit exceeded`エラー

**対処**:
```bash
# レート制限を緩和
RATE_LIMIT_INTERVAL=2000  # 2秒間隔に変更
```

### コスト管理

#### Railway.app料金

- **Hobbyプラン**: 月$5 + 従量課金
- **使用量確認**: ダッシュボード「Usage」タブ

#### Poe API料金

- プランによる（公式サイトで確認）
- 使用量モニタリング推奨

---

## Docker化（オプション）

### Dockerfile

ローカル開発やVPSデプロイ用にDocker化も可能です。

**`Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci --only=production

# ソースコピー
COPY . .

# ビルド
RUN npm run build

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

# 起動
CMD ["npm", "start"]
```

**`docker-compose.yml`**

```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Docker実行

```bash
# ビルド
docker-compose build

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 停止
docker-compose down
```

---

## セキュリティ対策

### 環境変数管理

- ✅ `.env`ファイルをGitに含めない（`.gitignore`で除外）
- ✅ Railway.appの環境変数機能を使用
- ❌ ソースコードに直接APIキーを書かない

### APIキーローテーション

定期的にAPIキーを更新することを推奨:

1. Discord Developer Portalで新しいBot Token生成
2. Poeで新しいAPI Key生成
3. Railway.appの環境変数を更新
4. 古いキーを無効化

---

## バックアップ・復旧

### GitHubによるバックアップ

- コードは自動的にGitHubにバックアップされる
- タグでバージョン管理推奨

```bash
# リリースタグ作成
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 復旧手順

1. GitHubから最新コードをクローン
2. Railway.appで新しいプロジェクト作成
3. 環境変数を再設定
4. デプロイ実行

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|---|---------|--------|
| 2025-10-17 | 1.0 | 初版作成 | Claude Code |

---

**デプロイ完了後**: 本番運用を開始し、ログをモニタリングしながら必要に応じて調整してください。
