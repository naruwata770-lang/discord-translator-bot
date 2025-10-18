# Railway.app デプロイ手順書

## 概要
Discord翻訳botをRailway.appにデプロイする手順書です。
AI言語検出機能（Phase 2）を含む最新版のデプロイ方法を説明します。

## 前提条件
- Railway.appアカウントを作成済み
- GitHubリポジトリと連携済み
- Poe APIキーを取得済み
- Discord Botトークンを取得済み

---

## 1. Railway.appプロジェクトのセットアップ

### 1.1 新規プロジェクト作成
1. Railway.appダッシュボードにログイン
2. 「New Project」をクリック
3. 「Deploy from GitHub repo」を選択
4. リポジトリを選択: `discord-translator-bot`
5. ブランチを選択: `main`

### 1.2 環境変数の設定
Railway.appダッシュボードで以下の環境変数を設定：

```bash
# Discord設定
DISCORD_BOT_TOKEN=<your_discord_bot_token>
TARGET_CHANNELS=<channel_id_1>,<channel_id_2>

# Poe API設定
POE_API_KEY=<your_poe_api_key>
POE_ENDPOINT_URL=https://api.poe.com/v1/chat/completions
POE_MODEL_NAME=Claude-3.5-Sonnet

# レート制限設定
RATE_LIMIT_CONCURRENT=1
RATE_LIMIT_INTERVAL=1000

# ログレベル
LOG_LEVEL=info

# 実行環境
NODE_ENV=production

# AI言語検出（Phase 3）
USE_AI_DETECTION=false  # 初期は false でデプロイ
```

**重要**: `USE_AI_DETECTION`は初期値を`false`にし、段階的に有効化します。

---

## 2. Phase 3: AI言語検出の段階的ロールアウト

### 2.1 初期デプロイ（ルールベース検出）
1. `USE_AI_DETECTION=false`でデプロイ
2. 既存のルールベース検出で動作確認
3. ログを確認して正常動作を確認

### 2.2 AI検出の有効化
**タイミング**: 初期デプロイから24時間後、動作が安定していることを確認してから

1. Railway.appダッシュボードで環境変数を変更
   ```bash
   USE_AI_DETECTION=true
   ```
2. 「Redeploy」は不要（環境変数変更のみで自動再起動）
3. ログを監視してAI検出の動作を確認

### 2.3 モニタリング項目
以下の項目をRailway.appのログで監視：

```typescript
// AI検出成功時
logger.info('AI detection succeeded', {
  method: 'ai',
  textLength: <number>,
  responseTime: <number>
});

// ルールベース検出時（フォールバック含む）
logger.info('Rule-based detection succeeded', {
  method: 'rule-based',
  sourceLang: 'ja' | 'zh',
  targetLang: 'ja' | 'zh',
  textLength: <number>
});

// AI検出失敗→フォールバック
logger.warn('AI detection failed, falling back to rule-based', {
  error: <string>,
  errorType: <string>
});

// 未対応言語
logger.info('Unsupported language detected by AI', {
  textSample: <string>
});
```

### 2.4 成功基準
**1週間の運用で以下を確認**:
- ✅ AI検出成功率 > 95%
- ✅ フォールバック頻度 < 5%
- ✅ 翻訳の応答時間 < 3秒（平均）
- ✅ ユーザーからの誤訳報告 < 3件/週

### 2.5 問題発生時のロールバック
#### レベル1: 即座切り替え（5分以内）
**トリガー**: AI検出の成功率が急低下（< 80%）

```bash
# Railway.appで環境変数を変更
USE_AI_DETECTION=false
# → 即座にルールベース検出に切り替わる（再デプロイ不要）
```

#### レベル2: コードロールバック（15分以内）
**トリガー**: 重大なバグ発見、予期しない動作

```bash
# Git で前のバージョンにロールバック
git revert <commit-hash>
git push origin main
# → Railway.appが自動再デプロイ
```

#### レベル3: 完全ロールバック（30分以内）
**トリガー**: システム全体の障害

```bash
# 最新の安定版タグにリセット
git reset --hard v1.0.2
git push --force origin main
# → Railway.appが自動再デプロイ
```

---

## 3. デプロイ後の確認

### 3.1 正常動作の確認
1. **Discord botがオンラインになっているか確認**
   - Discordサーバーでbotのステータスを確認

2. **テスト翻訳を実行**
   ```
   # 対象チャンネルで以下のメッセージを送信
   こんにちは
   → 你好 が返ってくることを確認

   你好
   → こんにちは が返ってくることを確認
   ```

3. **ログを確認**
   - Railway.appダッシュボードで「Logs」を開く
   - `AI detection succeeded` または `Rule-based detection succeeded` が表示されることを確認

### 3.2 エラーの確認
Railway.appのログで以下のエラーがないか確認：

```bash
# 認証エラー
ERROR: Poe API Error: 401 Unauthorized

# レート制限エラー
WARN: Rate limit hit, retrying after 5000ms

# ネットワークエラー
ERROR: Network error during API call
```

---

## 4. トラブルシューティング

### 4.1 Botがオンラインにならない
**原因**: 環境変数の設定ミス

**対策**:
1. `DISCORD_BOT_TOKEN`が正しいか確認
2. Railway.appのログで起動エラーを確認
3. `npm run build`がエラーなく完了しているか確認

### 4.2 翻訳が動作しない
**原因**: Poe APIの認証エラー

**対策**:
1. `POE_API_KEY`が正しいか確認
2. Poe APIの利用上限を確認
3. Railway.appのログで`AUTH_ERROR`を確認

### 4.3 AI検出が失敗する
**原因**: Poe APIの応答が不正

**対策**:
1. Railway.appのログで`ValidationError`を確認
2. `USE_AI_DETECTION=false`に切り替えてルールベース検出に戻す
3. 必要に応じてコードをロールバック

### 4.4 レート制限に達する
**原因**: 翻訳リクエストが多すぎる

**対策**:
1. `RATE_LIMIT_CONCURRENT`と`RATE_LIMIT_INTERVAL`を調整
2. Poe APIのレート制限を確認
3. 必要に応じてPoe APIのプランをアップグレード

---

## 5. コスト管理

### 5.1 Railway.appの料金
- **Starter Plan**: $5/月
- **使用量**: CPU、メモリ、ネットワークの使用量に応じて課金
- **推定コスト**: 月$5〜$10

### 5.2 Poe APIの料金
- **使用量ベース**: トークン消費量に応じて課金
- **推定コスト**: 月$5〜$15（翻訳頻度による）
- **節約方法**:
  - `max_tokens=1000`で制限
  - 不要なチャンネルを除外（`TARGET_CHANNELS`を絞る）

### 5.3 コスト監視
Railway.appダッシュボードで以下を定期的に確認：
- **CPU使用率**: < 50%を目安
- **メモリ使用量**: < 512MBを目安
- **ネットワーク転送量**: < 10GB/月を目安

---

## 6. メンテナンス

### 6.1 定期的な確認
**週次**:
- Railway.appのログでエラーがないか確認
- AI検出の成功率を確認
- ユーザーからのフィードバックを確認

**月次**:
- コストを確認
- パッケージの脆弱性スキャン（`npm audit`）
- 依存関係の更新（`npm update`）

### 6.2 アップデート手順
1. ローカルで変更を実装
2. `npm test`で全テスト通過を確認
3. `git commit`してプッシュ
4. Railway.appが自動デプロイ
5. デプロイ後、動作確認

---

## 7. セキュリティ

### 7.1 環境変数の管理
- **絶対にコミットしない**: `.env`ファイルは`.gitignore`に含める
- **Railway.appで管理**: すべての秘密情報はRailway.appの環境変数で管理
- **定期的なローテーション**: APIキーとトークンを定期的に更新

### 7.2 脆弱性対策
```bash
# 脆弱性スキャン
npm audit

# 自動修正
npm audit fix

# 重大な脆弱性がある場合は手動対応
npm audit fix --force
```

---

## 8. Railway.app固有の設定

### 8.1 Build Command
Railway.appが自動検出:
```bash
npm run build
```

### 8.2 Start Command
Railway.appが自動検出:
```bash
npm start
```

### 8.3 Health Check
Discord botにはHTTPエンドポイントがないため、Health Checkは無効化されています。

### 8.4 自動再起動
Railway.appはプロセスがクラッシュした場合、自動的に再起動します。

---

## 付録: 環境変数一覧

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `DISCORD_BOT_TOKEN` | ✅ | - | DiscordのBotトークン |
| `TARGET_CHANNELS` | ✅ | - | 対象チャンネルID（カンマ区切り） |
| `POE_API_KEY` | ✅ | - | Poe APIキー |
| `POE_ENDPOINT_URL` | ✅ | - | Poe APIのエンドポイントURL |
| `POE_MODEL_NAME` | ✅ | - | 使用するモデル名 |
| `RATE_LIMIT_CONCURRENT` | ⚠️ | 1 | 最大同時実行数 |
| `RATE_LIMIT_INTERVAL` | ⚠️ | 1000 | リクエスト間隔（ミリ秒） |
| `LOG_LEVEL` | ⚠️ | info | ログレベル |
| `NODE_ENV` | ⚠️ | development | 実行環境 |
| `USE_AI_DETECTION` | ⚠️ | false | AI言語検出の有効化 |

---

**作成日**: 2025-10-18
**最終更新**: 2025-10-18
**対象バージョン**: v2.0.0（Phase 2完了時）
