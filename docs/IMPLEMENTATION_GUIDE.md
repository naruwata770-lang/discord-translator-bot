# Discord自動翻訳bot - 実装ガイド

## プロジェクト構成

### ディレクトリ構造

```
discord-translator-bot/
├── src/
│   ├── index.ts                    # エントリーポイント
│   ├── config/
│   │   ├── config.ts              # 設定管理（ConfigStore）
│   │   └── env.schema.ts          # 環境変数スキーマ（zod）
│   ├── discord/
│   │   ├── client.ts              # DiscordClient
│   │   └── handlers/
│   │       └── messageHandler.ts  # MessageHandler
│   ├── services/
│   │   ├── translationService.ts  # TranslationService
│   │   ├── poeApiClient.ts        # PoeApiClient
│   │   ├── languageDetector.ts    # LanguageDetector
│   │   └── rateLimiter.ts         # RateLimiter
│   ├── commands/
│   │   └── commandParser.ts       # CommandParser
│   ├── utils/
│   │   ├── logger.ts              # Logger（pino）
│   │   ├── messageDispatcher.ts   # MessageDispatcher
│   │   └── errors.ts              # エラークラス
│   └── types/
│       └── index.ts               # 型定義
├── tests/
│   ├── unit/
│   │   ├── commandParser.test.ts
│   │   ├── languageDetector.test.ts
│   │   └── rateLimiter.test.ts
│   └── integration/
│       └── translationService.test.ts
├── docs/
│   ├── PROJECT_PLAN.md
│   ├── TECHNICAL_SPECIFICATION.md
│   ├── IMPLEMENTATION_GUIDE.md
│   └── DEPLOYMENT_GUIDE.md
├── .env.example                    # 環境変数サンプル
├── .gitignore
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── README.md
└── CLAUDE.md                       # プロジェクト憲法
```

---

## 環境構築

### 前提条件

- **Node.js**: 20.x以上
- **npm**: 10.x以上
- **Git**: バージョン管理
- **Discord Bot Token**: Discord Developer Portalで取得
- **Poe API Key**: Poe公式サイトで取得

### 初期セットアップ

#### 1. プロジェクト初期化

```bash
# プロジェクトディレクトリ作成
mkdir discord-translator-bot
cd discord-translator-bot

# package.json作成
npm init -y

# TypeScript & 依存関係インストール
npm install discord.js zod pino pino-pretty dotenv
npm install -D typescript @types/node ts-node nodemon
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint

# TypeScript設定
npx tsc --init
```

#### 2. `package.json` 編集

```json
{
  "name": "discord-translator-bot",
  "version": "1.0.0",
  "description": "Discord自動翻訳bot（日本語⇔中国語）",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "nodemon --watch src --exec ts-node src/index.ts",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "test": "echo \"Tests not implemented yet\" && exit 0"
  },
  "keywords": ["discord", "bot", "translation", "poe", "ai"],
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "dependencies": {
    "discord.js": "^14.14.0",
    "zod": "^3.22.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

#### 3. `tsconfig.json` 編集

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### 4. `.gitignore` 作成

```gitignore
# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# ビルド成果物
dist/
build/
*.tsbuildinfo

# 環境変数
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# ログ
logs/
*.log

# テスト
coverage/
.nyc_output/
```

#### 5. `.env.example` 作成

```bash
# Discord設定
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TARGET_CHANNELS=1234567890,0987654321

# Poe API設定
POE_API_KEY=your_poe_api_key_here
POE_ENDPOINT_URL=https://api.poe.com/v1/chat/completions
POE_MODEL_NAME=gpt-5.4-nano

# レート制限設定
RATE_LIMIT_CONCURRENT=1
RATE_LIMIT_INTERVAL=1000

# ログレベル（trace, debug, info, warn, error, fatal）
LOG_LEVEL=info
NODE_ENV=development
```

---

## 実装手順

### Phase 1: 基本構造の実装

#### Step 1: 型定義

**`src/types/index.ts`**

```typescript
export interface TranslationRequest {
  text: string;
  sourceLang?: string;
  targetLang?: string;
}

export interface TranslationResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

export interface Command {
  type: 'auto_on' | 'auto_off' | 'auto_status';
}

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_ERROR = 'AUTH_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNKNOWN = 'UNKNOWN',
}
```

#### Step 2: エラークラス

**`src/utils/errors.ts`**

```typescript
import { ErrorCode } from '../types';

export class TranslationError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}
```

#### Step 3: ロガー

**`src/utils/logger.ts`**

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export default logger;
```

#### Step 4: 設定管理

**`src/config/env.schema.ts`**

```typescript
import { z } from 'zod';

export const EnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'Discord bot token is required'),
  TARGET_CHANNELS: z.string().optional(),
  POE_API_KEY: z.string().min(1, 'Poe API key is required'),
  POE_ENDPOINT_URL: z.string().url().default('https://api.poe.com/v1/chat/completions'),
  POE_MODEL_NAME: z.string().default('gpt-5.4-nano'),
  RATE_LIMIT_CONCURRENT: z.string().default('1'),
  RATE_LIMIT_INTERVAL: z.string().default('1000'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;
```

**`src/config/config.ts`**

```typescript
import { config as dotenvConfig } from 'dotenv';
import { EnvSchema, Env } from './env.schema';
import logger from '../utils/logger';

dotenvConfig();

export class ConfigStore {
  private env: Env;

  constructor() {
    try {
      this.env = EnvSchema.parse(process.env);
      logger.info('Configuration loaded successfully');
    } catch (error) {
      logger.error('Configuration validation failed', { error });
      throw error;
    }
  }

  getDiscordToken(): string {
    return this.env.DISCORD_BOT_TOKEN;
  }

  getTargetChannels(): string[] {
    return this.env.TARGET_CHANNELS ? this.env.TARGET_CHANNELS.split(',') : [];
  }

  getPoeApiKey(): string {
    return this.env.POE_API_KEY;
  }

  getPoeEndpointUrl(): string {
    return this.env.POE_ENDPOINT_URL;
  }

  getPoeModelName(): string {
    return this.env.POE_MODEL_NAME;
  }

  getRateLimitConfig() {
    return {
      maxConcurrent: parseInt(this.env.RATE_LIMIT_CONCURRENT || '1', 10),
      minInterval: parseInt(this.env.RATE_LIMIT_INTERVAL || '1000', 10),
    };
  }
}

export const config = new ConfigStore();
```

#### Step 5: エントリーポイント

**`src/index.ts`**

```typescript
import { DiscordClient } from './discord/client';
import { config } from './config/config';
import logger from './utils/logger';

async function main() {
  try {
    logger.info('Starting Discord Translation Bot...');

    const client = new DiscordClient(config);
    await client.start();

    logger.info('Bot is now running');
  } catch (error) {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  }
}

// グレースフルシャットダウン
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main();
```

---

### Phase 2: コアロジックの実装

#### Step 6: コマンドパーサー

**`src/commands/commandParser.ts`**

```typescript
import { Command } from '../types';

export class CommandParser {
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

#### Step 7: 言語検出

**`src/services/languageDetector.ts`**

```typescript
export class LanguageDetector {
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
```

#### Step 8: レート制限

**`src/services/rateLimiter.ts`**

```typescript
import logger from '../utils/logger';

export class RateLimiter {
  private queue: Array<{resolve: () => void}> = [];
  private activeRequests = 0;
  private lastRequestTime = 0;

  constructor(
    private maxConcurrent: number,
    private minInterval: number
  ) {}

  async acquire(): Promise<void> {
    // スロットを確保してから待機処理に入る
    while (this.activeRequests >= this.maxConcurrent) {
      // キューに追加して待機
      logger.debug('Rate limiter: request queued', { queueLength: this.queue.length });
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
    logger.debug('Rate limiter: request acquired', { activeRequests: this.activeRequests });
  }

  release(): void {
    this.activeRequests--;
    logger.debug('Rate limiter: request released', { activeRequests: this.activeRequests });

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

#### Step 9: Poe APIクライアント

**`src/services/poeApiClient.ts`**

```typescript
import { TranslationRequest } from '../types';
import { TranslationError, ErrorCode } from '../utils/errors';
import logger from '../utils/logger';

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

export class PoeApiClient {
  private maxRetries = 3;
  private baseDelay = 1000; // 1秒

  constructor(
    private apiKey: string,
    private endpointUrl: string,
    private modelName: string
  ) {}

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
          logger.error('Poe API call failed with non-retryable error', { error });
          throw new TranslationError(
            'Translation API call failed',
            ErrorCode.API_ERROR,
            error as Error
          );
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

    logger.error('Poe API call failed after all retries', { lastError });
    throw new TranslationError(
      'Translation failed after retries',
      ErrorCode.API_ERROR,
      lastError as Error
    );
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
    const targetLang = request.targetLang || 'ja';
    const systemPrompt = this.getSystemPrompt(targetLang);
    const userMessage = this.getUserMessage(request.text, targetLang);

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
        Authorization: `Bearer ${this.apiKey}`,
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

  private getUserMessage(text: string, targetLang: string): string {
    const targetLangName = targetLang === 'ja' ? '日本語' : '中国語';
    return `以下のテキストを${targetLangName}に翻訳してください：\n\n${text}`;
  }
}
```

#### Step 10: 翻訳サービス

**`src/services/translationService.ts`**

```typescript
import { TranslationRequest, TranslationResult, ErrorCode } from '../types';
import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { TranslationError } from '../utils/errors';
import logger from '../utils/logger';

export class TranslationService {
  private poeClient: PoeApiClient;
  private languageDetector: LanguageDetector;
  private rateLimiter: RateLimiter;

  constructor(apiKey: string, endpointUrl: string, modelName: string, rateLimitConfig: any) {
    this.poeClient = new PoeApiClient(apiKey, endpointUrl, modelName);
    this.languageDetector = new LanguageDetector();
    this.rateLimiter = new RateLimiter(
      rateLimitConfig.maxConcurrent,
      rateLimitConfig.minInterval
    );
  }

  async translate(text: string): Promise<TranslationResult> {
    const startTime = Date.now();

    await this.rateLimiter.acquire();

    try {
      const sourceLang = this.languageDetector.detect(text);
      const targetLang = this.determineTargetLanguage(sourceLang);

      logger.info('Translation started', { sourceLang, targetLang, textLength: text.length });

      const translatedText = await this.poeClient.translate({
        text,
        sourceLang,
        targetLang,
      });

      const duration = Date.now() - startTime;
      logger.info('Translation completed', { sourceLang, targetLang, duration });

      return {
        translatedText,
        sourceLang,
        targetLang,
      };
    } catch (error) {
      logger.error('Translation failed', { error });

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
    return sourceLang === 'ja' ? 'zh' : 'ja';
  }
}
```

#### Step 11: メッセージディスパッチャー（Embed形式）

**`src/utils/messageDispatcher.ts`**

```typescript
import { Message, TextChannel, EmbedBuilder } from 'discord.js';
import { TranslationResult, ErrorCode } from '../types';
import { TranslationError } from './errors';
import logger from './logger';

export class MessageDispatcher {
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
      logger.info('Translation sent', { messageId: originalMessage.id });
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

### Phase 3: Discord統合

#### Step 12: メッセージハンドラー（自動翻訳対応）

**`src/discord/handlers/messageHandler.ts`**

```typescript
import { Message } from 'discord.js';
import { CommandParser } from '../../commands/commandParser';
import { TranslationService } from '../../services/translationService';
import { MessageDispatcher } from '../../utils/messageDispatcher';
import logger from '../../utils/logger';

export class MessageHandler {
  private commandParser: CommandParser;
  private translationService: TranslationService;
  private messageDispatcher: MessageDispatcher;
  private targetChannels: string[];
  private autoTranslateEnabled: Map<string, boolean> = new Map();

  constructor(
    translationService: TranslationService,
    targetChannels: string[]
  ) {
    this.commandParser = new CommandParser();
    this.translationService = translationService;
    this.messageDispatcher = new MessageDispatcher();
    this.targetChannels = targetChannels;

    // デフォルトで自動翻訳はON
    targetChannels.forEach(channelId => {
      this.autoTranslateEnabled.set(channelId, true);
    });
  }

  async handle(message: Message): Promise<void> {
    // bot自身のメッセージを無視
    if (message.author.bot) return;

    // 対象チャンネル判定（空の場合は全チャンネル対象）
    if (this.targetChannels.length > 0 && !this.targetChannels.includes(message.channelId)) {
      return;
    }

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

  private isAutoTranslateEnabled(channelId: string): boolean {
    // デフォルトはtrue（対象チャンネルが空の場合は全チャンネルで有効）
    if (this.targetChannels.length === 0) return true;
    return this.autoTranslateEnabled.get(channelId) ?? true;
  }

  private async handleCommand(command: any, message: Message): Promise<void> {
    const channelId = message.channelId;

    switch (command.type) {
      case 'auto_on':
        this.autoTranslateEnabled.set(channelId, true);
        await this.messageDispatcher.sendCommandResponse(
          message.channel as any,
          '✅ 自動翻訳を有効にしました'
        );
        logger.info('Auto-translation enabled', { channelId });
        break;

      case 'auto_off':
        this.autoTranslateEnabled.set(channelId, false);
        await this.messageDispatcher.sendCommandResponse(
          message.channel as any,
          '⏸️ 自動翻訳を無効にしました'
        );
        logger.info('Auto-translation disabled', { channelId });
        break;

      case 'auto_status':
        const enabled = this.isAutoTranslateEnabled(channelId);
        await this.messageDispatcher.sendCommandResponse(
          message.channel as any,
          `📊 自動翻訳: ${enabled ? '✅ 有効' : '⏸️ 無効'}`
        );
        break;
    }
  }

  private async handleAutoTranslation(message: Message): Promise<void> {
    try {
      logger.info('Auto-translation started', {
        userId: message.author.id,
        channelId: message.channelId,
      });

      const result = await this.translationService.translate(message.content);

      await this.messageDispatcher.sendTranslation(result, message);
    } catch (error) {
      logger.error('Auto-translation failed', { error });
      await this.messageDispatcher.sendError(message.channel as any, error as Error);
    }
  }
}
```

#### Step 13: Discordクライアント

**`src/discord/client.ts`**

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { ConfigStore } from '../config/config';
import { MessageHandler } from './handlers/messageHandler';
import { TranslationService } from '../services/translationService';
import logger from '../utils/logger';

export class DiscordClient {
  private client: Client;
  private messageHandler: MessageHandler;

  constructor(private config: ConfigStore) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    const translationService = new TranslationService(
      config.getPoeApiKey(),
      config.getPoeEndpointUrl(),
      config.getPoeModelName(),
      config.getRateLimitConfig()
    );

    this.messageHandler = new MessageHandler(
      translationService,
      config.getTargetChannels()
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      logger.info(`Bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message) => {
      await this.messageHandler.handle(message);
    });

    this.client.on('error', (error) => {
      logger.error('Discord client error', { error });
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.config.getDiscordToken());
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Discord client...');
    this.client.destroy();
  }
}
```

---

## 開発・テスト

### ローカル実行

```bash
# 環境変数設定
cp .env.example .env
# .envを編集してAPIキー・トークンを設定

# 開発モード起動（ホットリロード）
npm run dev

# ビルド & 本番モード起動
npm run build
npm start
```

### 動作確認

1. Discordサーバーでbotを招待
2. 対象チャンネルで以下をテスト:

#### 自動翻訳のテスト
```
👤 あなた: こんにちは！今日ゲームする？
🤖 bot: （Embed形式で翻訳結果を表示）
       你好！今天玩游戏吗？
```

#### コマンドのテスト
```
!auto off     → 自動翻訳を無効化
!auto on      → 自動翻訳を有効化
!auto status  → 現在の状態を確認
```

#### フィルタリングのテスト
以下のメッセージは翻訳されないこと:
- 1文字メッセージ: `w`
- URLのみ: `https://example.com`
- 絵文字のみ: `😀👍` `👍🏻` `👩‍💻`

以下のメッセージは翻訳されること:
- 短文（2文字以上）: `はい` `OK`

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|---|---------|--------|
| 2025-10-17 | 1.0 | 初版作成 | Claude Code |
| 2025-10-17 | 1.1 | 自動翻訳モード追加、Embed形式対応、!autoコマンド追加 | Claude Code |
| 2025-10-17 | 1.2 | Codexレビュー反映：メンション保護、フィルタリング改善、タイムスタンプ修正 | Claude Code |

---

**次のステップ**: デプロイ手順書（DEPLOYMENT_GUIDE.md）の作成
