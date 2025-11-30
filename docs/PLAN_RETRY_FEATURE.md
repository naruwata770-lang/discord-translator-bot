# 翻訳リトライ機能 実装計画

## 機能概要

ユーザーが翻訳結果に不満がある場合、リアクションボタン（🔄）をクリックして再翻訳を要求できる機能。
リトライ時は元メッセージを再フェッチするため、編集された内容も反映される。

## 現状分析

### 現在のアーキテクチャ

```
DiscordClient
  └─ Events.MessageCreate → MessageHandler.handle()
                                └─ handleAutoTranslation()
                                    └─ TranslationService.multiTranslate()
                                        └─ MessageDispatcher.sendMultiTranslation()
```

### 追加が必要なイベント

- `Events.MessageReactionAdd` - リアクションが追加された時のイベント

### 必要なIntents

- `GatewayIntentBits.GuildMessageReactions` - リアクション検知に必要

## 設計方針

### アプローチ

1. **翻訳メッセージに🔄リアクションを自動追加**
   - `sendMultiTranslation()` で送信後、Bot自身が🔄を追加
   - ユーザーはこのリアクションをクリックするだけで再翻訳を要求できる

2. **リアクションイベントを監視**
   - `MessageReactionAdd` イベントをリッスン
   - 🔄リアクションかつBot自身のメッセージへのリアクションを検出

3. **元メッセージとの関連付け**
   - Bot返信メッセージは `message.reply()` で送信されている
   - `message.reference?.messageId` で元メッセージIDを取得可能
   - リトライ時に元メッセージを再フェッチ（編集反映のため）

## 実装計画

### Step 1: Discord Intents の追加

**ファイル**: `src/discord/discordClient.ts`

- `GatewayIntentBits.GuildMessageReactions` を追加
- `Partials.Reaction` と `Partials.User` を追加（パーシャルリアクション対応）

### Step 2: リアクションハンドラーの作成

**新規ファイル**: `src/discord/reactionHandler.ts`

```typescript
export class ReactionHandler {
  private retryCooldowns: Map<string, number>;  // 元メッセージID -> 最終リトライ時刻
  private readonly COOLDOWN_MS = 30000;  // 30秒
  private readonly RETRY_EMOJI = '🔄';

  constructor(
    private translationService: TranslationService,
    private dispatcher: MessageDispatcher,
    private targetChannels: string[],
    private botUserId: string,
    cooldownMap?: Map<string, number>  // DI可能（テスト用）
  ) {
    this.retryCooldowns = cooldownMap ?? new Map();
  }

  // メインエントリポイント
  async handleRetryReaction(
    reaction: MessageReaction,
    user: User
  ): Promise<void> {
    // パーシャルの解決とフィルタリングを分離
    const resolvedData = await this.resolvePartials(reaction, user);
    if (!resolvedData) return;

    const validationResult = this.validateReaction(resolvedData);
    if (!validationResult.isValid) return;

    await this.executeRetry(resolvedData);
  }

  // パーシャルデータの解決（テスト容易性のため分離）
  private async resolvePartials(...): Promise<ResolvedReactionData | null>;

  // 検証ロジック（テスト容易性のため分離）
  private validateReaction(data: ResolvedReactionData): ValidationResult;

  // 実際のリトライ処理
  private async executeRetry(data: ResolvedReactionData): Promise<void>;
}
```

### Step 3: MessageDispatcher の拡張

**ファイル**: `src/discord/messageDispatcher.ts`

- `sendMultiTranslation()` 送信後に🔄リアクションを追加
- 戻り値の型を `Promise<Message | undefined>` に変更
  - 既存の呼び出し側（MessageHandler）は戻り値を使用していないため影響なし

### Step 4: DiscordClient にリアクションイベント登録

**ファイル**: `src/discord/discordClient.ts`

```typescript
this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    await this.reactionHandler.handleRetryReaction(reaction, user);
  } catch (error) {
    logger.error('Error handling reaction', { error });
  }
});
```

### Step 5: 依存関係の注入を更新

**ファイル**: `src/index.ts`

- `ReactionHandler` のインスタンス化
- `DiscordClient` に注入
- `botUserId` は `client.user.id` から取得（ready イベント後）

## 詳細設計

### リアクションイベントの処理フロー

```
1. ユーザーが🔄リアクションをクリック
2. MessageReactionAdd イベント発火
3. ReactionHandler.handleRetryReaction() が呼ばれる

4. パーシャル解決フェーズ:
   - reaction.partial の場合 → reaction.fetch()
   - reaction.message.partial の場合 → reaction.message.fetch()
   - user.partial の場合 → user.fetch()
   - フェッチ失敗 → ログ記録して終了

5. 検証フェーズ:
   - Bot自身のリアクションではないか
   - 🔄リアクションか
   - ギルド内のメッセージか（DMを除外）
   - 対象チャンネルか（targetChannels + スレッド対応）
   - Botが送信した翻訳メッセージか（author.id === botUserId）
   - reference があるか（翻訳返信メッセージの証拠）
   - クールダウン中ではないか

6. 実行フェーズ:
   - 元メッセージを取得（reference.messageId からフェッチ）
   - クールダウンMapを更新
   - 元メッセージのテキストで再翻訳実行
   - 新しい翻訳結果を送信（元メッセージへの返信として）
```

### エッジケースの考慮

1. **パーシャルリアクション**
   - `Partials.Reaction` と `Partials.User` をクライアント設定に追加
   - `reaction.fetch()`, `reaction.message.fetch()`, `user.fetch()` でフルデータ取得
   - **フェッチ後に再度 author.id を検証**（Codexレビュー指摘）

2. **元メッセージの取得失敗**
   - 削除された場合
   - 権限不足の場合
   - チャンネル移動の場合
   - → すべてエラーログを記録し、静かにスキップ（ユーザー通知なし）

3. **連打対策（クールダウン）**
   - **元メッセージID単位**で管理（Codexレビュー指摘で明確化）
   - 最後のリトライから30秒間は同じメッセージのリトライを拒否
   - クールダウンMapはDI可能にしてテスト容易性を確保

4. **スレッドでの動作**
   - 既存の `isTargetChannel()` ロジックと同様のチェックを実装
   - `ThreadChannel.parentId` で親チャンネルを確認

5. **DM対応**
   - DMでは機能させない（Codexレビュー指摘）
   - `message.guild` が null の場合はスキップ

6. **権限確認**
   - `MESSAGE CONTENT INTENT` は既に有効（既存機能で使用中）
   - 他人のメッセージへのリアクションでも、Botの翻訳メッセージへのリアクションのみ処理

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/discord/discordClient.ts` | Intents追加、Partials追加、リアクションイベント登録 |
| `src/discord/reactionHandler.ts` | 新規作成 |
| `src/discord/messageDispatcher.ts` | 🔄リアクション自動追加、戻り値変更 |
| `src/index.ts` | ReactionHandler のDI |
| `src/__tests__/reactionHandler.test.ts` | 新規テスト |

## テスト計画

### ユニットテスト

1. **ReactionHandler - validateReaction()**
   - Bot自身のリアクションを無視するか
   - 🔄以外のリアクションを無視するか
   - DM（guild === null）を無視するか
   - 対象チャンネル外を無視するか
   - Bot以外が送信したメッセージを無視するか
   - referenceがないメッセージを無視するか
   - クールダウン中のリトライを拒否するか

2. **ReactionHandler - resolvePartials()**
   - パーシャルリアクションを正しくフェッチするか
   - フェッチ失敗時にnullを返すか

3. **ReactionHandler - executeRetry()**
   - 正常に再翻訳が実行されるか
   - 元メッセージが削除されている場合のエラーハンドリング
   - クールダウンMapが更新されるか

4. **MessageDispatcher**
   - 送信後に🔄リアクションが追加されるか
   - リアクション追加失敗時もメッセージ送信は成功するか

### テスト容易性の確保（Codexレビュー指摘）

- `validateReaction()` を分離してモック不要でテスト可能に
- `resolvePartials()` を分離してDiscord APIモックを局所化
- クールダウンMapをコンストラクタでDI可能に
- 時間依存テストは `Date.now()` をモック化

### 統合テスト

- 実際のDiscord環境でのE2Eテスト（手動）

## 追加考慮事項

### 🔄リアクションの代替案

絵文字の選択肢:
- 🔄 (arrows_counterclockwise) - 最も直感的
- 🔁 (repeat) - 代替案
- ♻️ (recycle) - 代替案

**採用**: 🔄 が最も「再実行」を連想しやすい

### クールダウン機能

同一メッセージへの連続リトライを防ぐため:
- **元メッセージID単位**で管理
- 最後のリトライから30秒間は同じメッセージのリトライを拒否
- Mapでメッセージごとの最終リトライ時刻を管理
- 古いエントリは定期的にクリーンアップ（メモリリーク防止）

### 既存アーキテクチャとの整合性（Codexレビュー確認）

- `sendMultiTranslation()` の戻り値変更
  - 既存呼び出し側（MessageHandler.handleAutoTranslation）は戻り値を使用していない
  - 影響範囲なし、単純に戻り値を無視可能
