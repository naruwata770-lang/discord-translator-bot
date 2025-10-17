import { PoeApiClient } from './poeApiClient';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';

// fetch のモック
global.fetch = jest.fn();

describe('PoeApiClient', () => {
  let client: PoeApiClient;
  const mockApiKey = 'test-api-key';
  const mockEndpoint = 'https://api.poe.com/v1/chat/completions';
  const mockModel = 'Claude-3.5-Sonnet';

  beforeEach(() => {
    client = new PoeApiClient(mockApiKey, mockEndpoint, mockModel);
    jest.clearAllMocks();

    // sleep関数をモック化（即座に解決させる）
    jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);
  });

  describe('成功ケース', () => {
    it('正常な翻訳リクエストが成功する', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '你好',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translate('こんにちは', 'ja', 'zh');

      expect(result).toBe('你好');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockApiKey}`,
          }),
        })
      );
    });

    it('プロンプトに言語情報が含まれる', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.translate('こんにちは', 'ja', 'en');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.messages[0].content).toContain('Japanese');
      expect(body.messages[0].content).toContain('English');
      expect(body.messages[0].content).toContain('こんにちは');
    });
  });

  describe('エラーハンドリング', () => {
    it('401エラーでAUTH_ERRORを投げる', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
        headers: {
          get: () => null,
        },
      });

      try {
        await client.translate('test', 'ja', 'zh');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.AUTH_ERROR);
      }

      // 認証エラーはリトライしないので1回のみ
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('429エラーでRATE_LIMITを投げる（リトライ後）', async () => {
      // 429エラーを4回連続で返す（初回 + 3回リトライ）
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '5' : null),
        },
      });

      try {
        await client.translate('test', 'ja', 'zh');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.RATE_LIMIT);
      }

      // 429エラーはリトライするので、初回 + 3回リトライ = 4回
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('500エラーでNETWORK_ERRORを投げる', async () => {
      // 初回+3回リトライ=4回全て500エラーを返す
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
        headers: {
          get: () => null,
        },
      });

      try {
        await client.translate('test', 'ja', 'zh');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
    });

    it('ネットワークエラーでNETWORK_ERRORを投げる', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network failure')
      );

      try {
        await client.translate('test', 'ja', 'zh');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
    });

    it('不正なレスポンス形式でAPI_ERRORを投げる', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'response' }),
      });

      try {
        await client.translate('test', 'ja', 'zh');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.API_ERROR);
      }
    });
  });

  describe('リトライ機能', () => {
    it('500エラーで最大3回リトライする', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Error',
          headers: {
            get: () => null,
          },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Error',
          headers: {
            get: () => null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'Success' } }] }),
        });

      const result = await client.translate('test', 'ja', 'zh');

      expect(result).toBe('Success');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('3回リトライしても失敗したらエラーを投げる', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Persistent error',
        headers: {
          get: () => null,
        },
      });

      await expect(
        client.translate('test', 'ja', 'zh')
      ).rejects.toThrow(TranslationError);

      // 初回 + 3回リトライ = 4回
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('429エラーはRetry-Afterヘッダーを尊重してリトライする', async () => {
      // 最初の2回は429、3回目は成功
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limit',
          headers: {
            get: (name: string) => (name === 'Retry-After' ? '1' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limit',
          headers: {
            get: (name: string) => (name === 'Retry-After' ? '2' : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'Success' } }] }),
        });

      const result = await client.translate('test', 'ja', 'zh');

      expect(result).toBe('Success');
      // 初回 + 2回リトライ = 3回
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
