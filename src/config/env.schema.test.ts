import { envSchema } from './env.schema';

const baseEnv = {
  DISCORD_BOT_TOKEN: 'discord-token',
  AI_GATEWAY_API_KEY: 'gateway-key',
};

describe('envSchema（AI Gateway設定）', () => {
  it('Vercel AI Gatewayの既定値が入る', () => {
    const env = envSchema.parse(baseEnv);

    expect(env.AI_GATEWAY_BASE_URL).toBe('https://ai-gateway.vercel.sh/v1');
    expect(env.AI_MODEL_NAME).toBe('openai/gpt-5.4-mini');
  });

  it('AI_GATEWAY_API_KEYがないと起動できない', () => {
    expect(() => envSchema.parse({ DISCORD_BOT_TOKEN: 'discord-token' })).toThrow(
      /AI_GATEWAY_API_KEY/
    );
  });

  it('AI_GATEWAY_BASE_URLとAI_MODEL_NAMEを上書きできる', () => {
    const env = envSchema.parse({
      ...baseEnv,
      AI_GATEWAY_BASE_URL: 'http://127.0.0.1:8080/v1',
      AI_MODEL_NAME: 'anthropic/claude-haiku-4.5',
    });

    expect(env.AI_GATEWAY_BASE_URL).toBe('http://127.0.0.1:8080/v1');
    expect(env.AI_MODEL_NAME).toBe('anthropic/claude-haiku-4.5');
  });

  it('提供元の付いていないモデル名（Poe時代の書き方）は弾く', () => {
    expect(() =>
      envSchema.parse({ ...baseEnv, AI_MODEL_NAME: 'gpt-5.4-mini' })
    ).toThrow(/provider\/model/);
  });

  it('Poe用の環境変数が残っていても無視される', () => {
    const env = envSchema.parse({
      ...baseEnv,
      POE_API_KEY: 'old-poe-key',
      POE_MODEL_NAME: 'gpt-5.4-mini',
    });

    expect(env.AI_MODEL_NAME).toBe('openai/gpt-5.4-mini');
    expect(env).not.toHaveProperty('POE_API_KEY');
  });
});
