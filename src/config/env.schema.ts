import { z } from 'zod';

export const envSchema = z.object({
  // Discord設定
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  TARGET_CHANNELS: z.string().optional(),

  // Poe API設定
  POE_API_KEY: z.string().min(1, 'POE_API_KEY is required'),
  POE_ENDPOINT_URL: z
    .string()
    .url()
    .default('https://api.poe.com/v1/chat/completions'),
  POE_MODEL_NAME: z.string().default('Claude-3.5-Sonnet'),

  // レート制限設定
  RATE_LIMIT_CONCURRENT: z.string().optional(),
  RATE_LIMIT_INTERVAL: z.string().optional(),

  // ログ設定
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema>;
