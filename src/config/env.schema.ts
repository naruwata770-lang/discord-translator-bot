import { z } from 'zod';

export const envSchema = z.object({
  // Discord設定
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  TARGET_CHANNELS: z.string().optional(),

  // Vercel AI Gateway設定（OpenAI互換API）
  AI_GATEWAY_API_KEY: z.string().min(1, 'AI_GATEWAY_API_KEY is required'),
  AI_GATEWAY_BASE_URL: z
    .string()
    .url()
    .default('https://ai-gateway.vercel.sh/v1'),
  // モデル名は「提供元/モデル」の形式（例: openai/gpt-5.4-mini）
  AI_MODEL_NAME: z
    .string()
    .regex(
      /^[^/\s]+\/[^\s]+$/,
      'AI_MODEL_NAME must be in provider/model format (e.g. openai/gpt-5.4-mini)'
    )
    .default('openai/gpt-5.4-mini'),

  // レート制限設定
  RATE_LIMIT_CONCURRENT: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 1;
      const num = Number(val);
      if (isNaN(num) || num <= 0) return 1;
      return Math.max(1, Math.floor(num)); // 最小1、整数に丸める
    }),
  RATE_LIMIT_INTERVAL: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 1000;
      const num = Number(val);
      if (isNaN(num) || num <= 0) return 1000;
      return Math.max(100, Math.floor(num)); // 最小100ms、整数に丸める
    }),

  // ログ設定
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // AI言語検出設定
  USE_AI_DETECTION: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true'),
});

export type Env = z.infer<typeof envSchema>;
