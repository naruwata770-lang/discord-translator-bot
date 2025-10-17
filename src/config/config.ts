import dotenv from 'dotenv';
import { envSchema, Env } from './env.schema';
import logger from '../utils/logger';

// 環境変数を読み込み
dotenv.config();

export class ConfigStore {
  private static instance: ConfigStore;
  private config: Env;

  private constructor() {
    try {
      this.config = envSchema.parse(process.env);
      logger.info('Configuration loaded successfully');
    } catch (error) {
      logger.error('Configuration validation failed', { error });
      throw error;
    }
  }

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  get discordBotToken(): string {
    return this.config.DISCORD_BOT_TOKEN;
  }

  get targetChannels(): string[] {
    if (!this.config.TARGET_CHANNELS) return [];
    return this.config.TARGET_CHANNELS.split(',').map((id) => id.trim());
  }

  get poeApiKey(): string {
    return this.config.POE_API_KEY;
  }

  get poeEndpointUrl(): string {
    return this.config.POE_ENDPOINT_URL;
  }

  get poeModelName(): string {
    return this.config.POE_MODEL_NAME;
  }

  get rateLimitConcurrent(): number {
    return this.config.RATE_LIMIT_CONCURRENT;
  }

  get rateLimitInterval(): number {
    return this.config.RATE_LIMIT_INTERVAL;
  }

  get logLevel(): string {
    return this.config.LOG_LEVEL;
  }

  get nodeEnv(): string {
    return this.config.NODE_ENV;
  }
}

export default ConfigStore.getInstance();
