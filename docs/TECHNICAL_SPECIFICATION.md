# Discord自動翻訳bot - 技術仕様書

## システムアーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│                         Discord                              │
│                  (メッセージング基盤)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │ WebSocket/REST API
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   Discord Bot Application                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              DiscordClient (discord.js)              │   │
│  │         - イベント監視（messageCreate）               │   │
│  │         - メッセージ送信                              │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │             MessageHandler                           │   │
│  │         - メッセージフィルタリング                      │   │
│  │         - bot自身のメッセージ除外                       │   │
│  │         - 対象チャンネル判定                           │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │             CommandParser                            │   │
│  │         - コマンド解析（!translate）                   │   │
│  │         - 引数抽出                                    │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │          TranslationService                          │   │
│  │         - 翻訳ロジック                                │   │
│  │         - 言語検出                                    │   │
│  │         - リトライ処理                                │   │
│  │         - レート制限                                  │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │             PoeApiClient                             │   │
│  │         - Poe API呼び出し                             │   │
│  │         - プロンプト構築                               │   │
│  │         - エラーハンドリング                           │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │          MessageDispatcher                           │   │
│  │         - 翻訳結果整形                                │   │
│  │         - メッセージ送信                              │   │
│  │         - エラーメッセージ送信                         │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │              ConfigStore                             │   │
│  │         - 環境変数読み込み                            │   │
│  │         - 設定バリデーション（zod）                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Logger (pino)                            │  │
│  │         - 構造化ログ出力                              │  │
│  │         - エラートラッキング                          │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                      Poe API                                  │
│              (OpenAI互換翻訳API)                              │
└───────────────────────────────────────────────────────────────┘
```

---

## コンポーネント設計

### 1. DiscordClient

**責務**: Discord APIとの接続・イベント監視

```typescript
class DiscordClient {
  private client: Client;
  private messageHandler: MessageHandler;

  constructor(config: BotConfig) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  async start(): Promise<void>
  on(event: 'messageCreate', handler: (message: Message) => void): void
  async shutdown(): Promise<void>
}
```

**依存関係**:
- `discord.js`: Discord API通信
- `MessageHandler`: メッセージ処理の委譲

---

### 2. MessageHandler

**責務**: メッセージのフィルタリング・振り分け

```typescript
class MessageHandler {
  private commandParser: CommandParser;
  private translationService: TranslationService;
  private messageDispatcher: MessageDispatcher;
  private config: BotConfig;
  private autoTranslateEnabled: Map<string, boolean> = new Map();

  async handle(message: Message): Promise<void> {
    // bot自身のメッセージを無視
    if (message.author.bot) return;

    // 対象チャンネル判定
    if (!this.isTargetChannel(message.channelId)) return;

    // コマンド解析（!auto on/off）
    const command = this.commandParser.parse(message.content);
    if (command) {
      await this.handleCommand(command, message);
      return;
    }

    // 自動翻訳が無効なチャンネルはスキップ
    if (!this.isAutoTranslateEnabled(message.channelId)) return;

    // 翻訳をスキップすべきメッセージかチェック
    if (this.shouldSkipTranslation(message)) return;

    // 自動翻訳実行
    await this.handleAutoTranslation(message);
  }

  private shouldSkipTranslation(message: Message): boolean {
    const trimmed = message.content.trim();

    // 空または極端に短いメッセージ（1文字以下）
    if (trimmed.length <= 1) return true;

    // URLのみのメッセージ
    if (/^https?:\/\/\S+$/.test(trimmed)) return true;

    // 絵文字のみ（Unicode Extended_Pictographicプロパティを使用）
    if (/^\p{Extended_Pictographic}+$/u.test(trimmed)) return true;

    // コマンドメッセージ（!で始まる）
    if (message.content.startsWith('!')) return true;

    // 添付ファイルまたはEmbedのみ（テキストなし）
    if (trimmed.length === 0 && (message.attachments.size > 0 || message.embeds.length > 0)) {
      return true;
    }

    return false;
  }

  private isTargetChannel(channelId: string): boolean
  private isAutoTranslateEnabled(channelId: string): boolean
  private async handleCommand(command: Command, message: Message): Promise<void>
  private async handleAutoTranslation(message: Message): Promise<void>
}
```

**依存関係**:
- `CommandParser`: コマンド解析（!auto on/off）
- `TranslationService`: 翻訳実行
- `MessageDispatcher`: Embed形式での送信

---

### 3. CommandParser

**責務**: コマンドの解析・バリデーション

```typescript
interface Command {
  type: 'auto_on' | 'auto_off' | 'auto_status';
}

class CommandParser {
  parse(content: string): Command | null {
    const trimmed = content.trim().toLowerCase();

    // !auto on
    if (trimmed === '!auto on') {
      return { type: 'auto_on' };
    }

    // !auto off
    if (trimmed === '!auto off') {
      return { type: 'auto_off' };
    }

    // !auto status
    if (trimmed === '!auto status' || trimmed === '!auto') {
      return { type: 'auto_status' };
    }

    return null;
  }
}
```

---

### 4. TranslationService

**責務**: 翻訳のコアロジック

```typescript
class TranslationService {
  private poeClient: PoeApiClient;
  private languageDetector: LanguageDetector;
  private rateLimiter: RateLimiter;

  async translate(text: string, options?: TranslationOptions): Promise<TranslationResult> {
    // レート制限チェック
    await this.rateLimiter.acquire();

    try {
      // 言語検出
      const sourceLang = options?.sourceLang || await this.languageDetector.detect(text);
      const targetLang = this.determineTargetLanguage(sourceLang);

      // 翻訳実行
      const result = await this.poeClient.translate({
        text,
        sourceLang,
        targetLang,
      });

      return {
        translatedText: result,
        sourceLang,
        targetLang,
      };
    } catch (error) {
      // すでにTranslationErrorの場合はそのまま再スロー
      if (error instanceof TranslationError) {
        throw error;
      }

      // その他のエラーは汎用的なAPI_ERRORでラップ
      throw new TranslationError('Translation failed', ErrorCode.API_ERROR, error as Error);
    } finally {
      this.rateLimiter.release();
    }
  }

  private determineTargetLanguage(sourceLang: string): string {
    // 日本語→中国語、中国語→日本語
    return sourceLang === 'ja' ? 'zh' : 'ja';
  }
}

interface TranslationOptions {
  sourceLang?: string;
  targetLang?: string;
}

interface TranslationResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}
```

---

### 5. PoeApiClient

**責務**: Poe APIとの通信

```typescript
class PoeApiClient {
  private apiKey: string;
  private endpointUrl: string;
  private modelName: string;
  private maxRetries = 3;
  private baseDelay = 1000; // 1秒

  async translate(request: TranslationRequest): Promise<string> {
    const prompt = this.buildPrompt(request);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.callApi(prompt);
        return response.choices[0].message.content;
      } catch (error: any) {
        lastError = error;

        // リトライ不可能なエラーの場合は即座に失敗
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // 最後の試行の場合はリトライしない
        if (attempt === this.maxRetries) {
          break;
        }

        // 指数バックオフで待機
        const delay = this.calculateBackoffDelay(attempt, error);
        logger.warn(`API call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`, {
          error: error.message,
          statusCode: error.statusCode
        });
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Translation failed after retries');
  }

  private isNonRetryableError(error: any): boolean {
    // 認証エラー、無効な入力など、リトライしても意味がないエラー
    const nonRetryableStatuses = [400, 401, 403, 404];
    return nonRetryableStatuses.includes(error.statusCode);
  }

  private calculateBackoffDelay(attempt: number, error: any): number {
    // 429エラー（レート制限）の場合は固定待機
    if (error.statusCode === 429) {
      return error.retryAfter ? error.retryAfter * 1000 : 10000; // 10秒
    }

    // 指数バックオフ: baseDelay * 2^attempt + jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // 最大1秒のランダム遅延
    return Math.min(exponentialDelay + jitter, 30000); // 最大30秒
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildPrompt(request: TranslationRequest): PoeApiRequest {
    const systemPrompt = this.getSystemPrompt(request.targetLang);
    const userMessage = this.getUserMessage(request.text, request.sourceLang, request.targetLang);

    return {
      model: this.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    };
  }

  private async callApi(prompt: PoeApiRequest): Promise<PoeApiResponse> {
    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(prompt),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const statusCode = response.status;

      // ステータスコードに応じたErrorCodeを決定
      let errorCode: ErrorCode;
      if (statusCode === 401 || statusCode === 403) {
        errorCode = ErrorCode.AUTH_ERROR;
      } else if (statusCode === 400) {
        errorCode = ErrorCode.INVALID_INPUT;
      } else if (statusCode === 429) {
        errorCode = ErrorCode.RATE_LIMIT;
      } else if (statusCode >= 500) {
        errorCode = ErrorCode.NETWORK_ERROR;
      } else {
        errorCode = ErrorCode.API_ERROR;
      }

      const error = new TranslationError(
        `Poe API Error: ${statusCode} ${response.statusText} - ${errorText}`,
        errorCode
      );

      // Retry-Afterヘッダーがあれば取得
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        (error as any).retryAfter = parseInt(retryAfter, 10);
      }
      (error as any).statusCode = statusCode;

      throw error;
    }

    return await response.json();
  }

  private getSystemPrompt(targetLang: string): string {
    const langName = targetLang === 'ja' ? '日本語' : '中文';
    return `あなたは優秀な翻訳者です。与えられたテキストを自然で正確な${langName}に翻訳してください。

重要な指示：
- 翻訳結果のみを出力してください
- 説明や追加のコメントは一切不要です
- 元の意味とニュアンスを保持してください
- 自然で流暢な${langName}にしてください`;
  }

  private getUserMessage(text: string, sourceLang: string, targetLang: string): string {
    const targetLangName = targetLang === 'ja' ? '日本語' : '中国語';
    return `以下のテキストを${targetLangName}に翻訳してください：\n\n${text}`;
  }
}

interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
}

interface PoeApiRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  max_tokens: number;
}

interface PoeApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}
```

---

### 6. LanguageDetector

**責務**: 言語の自動検出

```typescript
class LanguageDetector {
  detect(text: string): string {
    // 文字種を判定
    const hasHiragana = /[\u3040-\u309f]/.test(text);
    const hasKatakana = /[\u30a0-\u30ff]/.test(text);
    const hasKanji = /[\u4e00-\u9faf]/.test(text);

    // 日本語固有の句読点
    const hasJapanesePunctuation = /[、。「」『』・]/.test(text);

    // 中国語固有の句読点
    const hasChinesePunctuation = /[，。？！：；""''【】（）]/.test(text);

    // ひらがな・カタカナがあれば日本語
    if (hasHiragana || hasKatakana) {
      return 'ja';
    }

    // 日本語句読点があれば日本語（漢字のみでも判定可能）
    if (hasJapanesePunctuation) {
      return 'ja';
    }

    // 中国語句読点があれば中国語
    if (hasChinesePunctuation) {
      return 'zh';
    }

    // 漢字のみの場合
    if (hasKanji) {
      // 常用漢字の頻度で判定（日本語に多い漢字）
      const jpCommonKanji = /[人日本語一二三時間会社]/;
      const jpKanjiCount = (text.match(jpCommonKanji) || []).length;

      // 日本語でよく使われる漢字が多ければ日本語と判定
      if (jpKanjiCount > 0) {
        return 'ja';
      }

      // それ以外は中国語と判定
      return 'zh';
    }

    // デフォルト: 日本語
    return 'ja';
  }
}

// Phase 2: 高度な言語検出（franc等）
import { franc } from 'franc';

class AdvancedLanguageDetector {
  detect(text: string): string {
    const result = franc(text, { only: ['jpn', 'cmn'] });

    switch (result) {
      case 'jpn':
        return 'ja';
      case 'cmn':
        return 'zh';
      default:
        return 'ja';
    }
  }
}
```

---

### 7. RateLimiter

**責務**: API呼び出しのレート制限

```typescript
class RateLimiter {
  private queue: Array<{resolve: () => void}> = [];
  private activeRequests = 0;
  private maxConcurrent: number;
  private minInterval: number;
  private lastRequestTime = 0;

  constructor(maxConcurrent: number, minInterval: number) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minInterval;
  }

  async acquire(): Promise<void> {
    // スロットを確保してから待機処理に入る
    while (this.activeRequests >= this.maxConcurrent) {
      // キューに追加して待機
      await new Promise<void>((resolve) => {
        this.queue.push({ resolve });
      });
    }

    // スロット確保（他のリクエストがこれ以上入れないようにする）
    this.activeRequests++;

    // 最小間隔を確保
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await this.sleep(this.minInterval - elapsed);
    }

    this.lastRequestTime = Date.now();
  }

  release(): void {
    this.activeRequests--;

    // キューから次のリクエストを処理
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

### 8. MessageDispatcher

**責務**: 翻訳結果の整形・送信（Embed形式）

```typescript
import { EmbedBuilder } from 'discord.js';

class MessageDispatcher {
  async sendTranslation(
    result: TranslationResult,
    originalMessage: Message
  ): Promise<void> {
    const embed = this.buildEmbed(result, originalMessage);

    try {
      await originalMessage.reply({
        embeds: [embed],
        allowedMentions: { parse: [] }, // メンション保護（@everyoneなどを無効化）
      });
    } catch (error) {
      logger.error('Failed to send translation', { error });
      throw error;
    }
  }

  async sendError(channel: TextChannel, error: Error): Promise<void> {
    const errorMessage = this.formatError(error);
    await channel.send(errorMessage);
  }

  async sendCommandResponse(channel: TextChannel, message: string): Promise<void> {
    await channel.send(message);
  }

  private buildEmbed(result: TranslationResult, originalMessage: Message): EmbedBuilder {
    const flag = result.sourceLang === 'ja' ? '🇯🇵→🇨🇳' : '🇨🇳→🇯🇵';

    return new EmbedBuilder()
      .setColor(0x5865F2) // Discordブルー
      .setAuthor({
        name: originalMessage.author.username,
        iconURL: originalMessage.author.displayAvatarURL(),
      })
      .setDescription(result.translatedText)
      .setFooter({
        text: `${flag} 自動翻訳`,
      })
      .setTimestamp(originalMessage.createdAt); // 原文の投稿時刻を使用
  }

  private formatError(error: Error): string {
    // エラーコードに応じて安全なメッセージを返す
    if (error instanceof TranslationError) {
      switch (error.code) {
        case ErrorCode.NETWORK_ERROR:
          return '⚠️ ネットワークエラーが発生しました。しばらくしてから再度お試しください。';
        case ErrorCode.RATE_LIMIT:
          return '⚠️ リクエストが多すぎます。少し待ってから再度お試しください。';
        case ErrorCode.AUTH_ERROR:
          return '⚠️ 認証エラーが発生しました。管理者にお問い合わせください。';
        case ErrorCode.API_ERROR:
          return '⚠️ 翻訳サービスでエラーが発生しました。しばらくしてから再度お試しください。';
        case ErrorCode.INVALID_INPUT:
          return '⚠️ 入力が正しくありません。テキストを確認してください。';
        default:
          return '⚠️ 翻訳に失敗しました。しばらくしてから再度お試しください。';
      }
    }

    // 一般的なエラーの場合は汎用メッセージ
    return '⚠️ 翻訳に失敗しました。しばらくしてから再度お試しください。';
  }
}
```

---

### 9. ConfigStore

**責務**: 設定の読み込み・バリデーション

```typescript
import { z } from 'zod';

const BotConfigSchema = z.object({
  discord: z.object({
    token: z.string().min(1, 'Discord bot token is required'),
    targetChannels: z.array(z.string()).optional(),
  }),
  poe: z.object({
    apiKey: z.string().min(1, 'Poe API key is required'),
    endpointUrl: z.string().url().default('https://api.poe.com/v1/chat/completions'),
    modelName: z.string().default('gpt-5.4-nano'),
  }),
  rateLimiter: z.object({
    maxConcurrent: z.number().positive().default(1),
    minInterval: z.number().positive().default(1000),
  }),
});

type BotConfig = z.infer<typeof BotConfigSchema>;

class ConfigStore {
  private config: BotConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): BotConfig {
    const rawConfig = {
      discord: {
        token: process.env.DISCORD_BOT_TOKEN,
        targetChannels: process.env.TARGET_CHANNELS?.split(','),
      },
      poe: {
        apiKey: process.env.POE_API_KEY,
        endpointUrl: process.env.POE_ENDPOINT_URL,
        modelName: process.env.POE_MODEL_NAME,
      },
      rateLimiter: {
        maxConcurrent: process.env.RATE_LIMIT_CONCURRENT
          ? Number(process.env.RATE_LIMIT_CONCURRENT)
          : undefined,
        minInterval: process.env.RATE_LIMIT_INTERVAL
          ? Number(process.env.RATE_LIMIT_INTERVAL)
          : undefined,
      },
    };

    return BotConfigSchema.parse(rawConfig);
  }

  get(): BotConfig {
    return this.config;
  }
}
```

---

## データフロー

### 自動翻訳処理フロー

```
1. Discord → messageCreate イベント
   ↓
2. MessageHandler: メッセージフィルタリング
   - bot自身のメッセージ？ → スキップ
   - 対象チャンネル？ → 次へ
   - コマンドメッセージ？ → コマンド処理へ
   ↓
3. MessageHandler: 翻訳スキップ判定
   - 自動翻訳が無効？ → スキップ
   - 短すぎる（3文字未満）？ → スキップ
   - URLのみ？ → スキップ
   - 絵文字のみ？ → スキップ
   - 添付ファイルのみ？ → スキップ
   ↓
4. TranslationService: 翻訳実行
   - レート制限チェック
   - 言語検出（日本語 or 中国語）
   - 翻訳先言語決定（ja→zh, zh→ja）
   ↓
5. PoeApiClient: API呼び出し
   - プロンプト構築
   - Poe API呼び出し（リトライ付き）
   - レスポンス解析
   ↓
6. MessageDispatcher: Embed形式で送信
   - Embed構築（ユーザーアイコン、翻訳結果）
   - Discord送信（リプライ形式）
   ↓
7. 完了
```

### コマンド処理フロー（!auto on/off）

```
1. Discord → messageCreate イベント
   ↓
2. MessageHandler: コマンド検出
   - "!auto on" → 自動翻訳ON
   - "!auto off" → 自動翻訳OFF
   - "!auto status" → 現在の状態表示
   ↓
3. MessageHandler: 状態更新
   - チャンネルごとの自動翻訳状態を保存
   ↓
4. MessageDispatcher: 確認メッセージ送信
   - "✅ 自動翻訳を有効にしました"
   - "⏸️ 自動翻訳を無効にしました"
   ↓
5. 完了
```

---

## エラーハンドリング

### エラー種別

```typescript
class TranslationError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_ERROR = 'AUTH_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNKNOWN = 'UNKNOWN',
}
```

### リトライ戦略

| エラー種別 | リトライ | 戦略 |
|-----------|---------|------|
| NETWORK_ERROR | ✅ | 指数バックオフ（最大3回） |
| RATE_LIMIT | ✅ | 固定待機（10秒） |
| API_ERROR | ❌ | ユーザーに通知 |
| AUTH_ERROR | ❌ | ログ出力、管理者通知 |
| INVALID_INPUT | ❌ | ユーザーに通知 |

---

## セキュリティ

### 機密情報管理

- **環境変数**: `.env`ファイルで管理（Gitに含めない）
- **Discord Bot Token**: `DISCORD_BOT_TOKEN`
- **Poe API Key**: `POE_API_KEY`

### `.env.example`

```bash
# Discord設定
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TARGET_CHANNELS=channel_id_1,channel_id_2

# Poe API設定
POE_API_KEY=your_poe_api_key_here
POE_ENDPOINT_URL=https://api.poe.com/v1/chat/completions
POE_MODEL_NAME=gpt-5.4-nano

# レート制限設定
RATE_LIMIT_CONCURRENT=1
RATE_LIMIT_INTERVAL=1000

# ログレベル
LOG_LEVEL=info
```

---

## パフォーマンス要件

| 指標 | 目標値 | 備考 |
|------|--------|------|
| 翻訳レスポンスタイム | < 5秒 | Poe API依存 |
| bot起動時間 | < 10秒 | Discord接続含む |
| メモリ使用量 | < 256MB | Railway.app無料枠対応 |
| CPU使用率 | < 50% | アイドル時 < 10% |
| 同時翻訳処理数 | 1 | レート制限による |

---

## ログ設計

### ログレベル

- **error**: システムエラー、API呼び出し失敗
- **warn**: リトライ、レート制限
- **info**: 翻訳実行、bot起動・停止
- **debug**: 詳細な処理フロー

### ログフォーマット（pino）

```json
{
  "level": 30,
  "time": 1697500000000,
  "pid": 1234,
  "hostname": "bot-server",
  "msg": "Translation completed",
  "context": {
    "messageId": "1234567890",
    "userId": "9876543210",
    "sourceLang": "ja",
    "targetLang": "zh",
    "duration": 1234
  }
}
```

---

## API制限・制約

### Discord API制限

- メッセージ送信: 50 req/s
- グローバル: 50 req/s
- バースト: 最大120秒間

### Poe API制限

- プランによる（要確認）
- リトライ: 429エラー時に待機

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|---|---------|--------|
| 2025-10-17 | 1.0 | 初版作成 | Claude Code |
| 2025-10-17 | 1.1 | 自動翻訳モード追加、Embed形式対応、!autoコマンド追加 | Claude Code |
| 2025-10-17 | 1.2 | Codexレビュー反映：メンション保護、フィルタリング改善、タイムスタンプ修正 | Claude Code |

---

**次のステップ**: 実装ガイド（IMPLEMENTATION_GUIDE.md）の作成
