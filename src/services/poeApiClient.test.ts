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

    it('プロンプトに言語情報と重要なルールが含まれる', async () => {
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
      expect(body.messages[0].content).toContain('IMPORTANT RULES');
      expect(body.messages[0].content).toContain('do NOT return the original text');
    });

    it('辞書ヒント付きの翻訳が成功する', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'カラピチューは強い',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const dictionaryHint = 'Use these translations for specific terms:\n- 卡拉彼丘 → カラピチュー';

      const result = await client.translate('卡拉彼丘很强', 'zh', 'ja', dictionaryHint);

      expect(result).toBe('カラピチューは強い');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      // プロンプトに辞書ヒントが含まれているか確認
      expect(body.messages[0].content).toContain(dictionaryHint);
      expect(body.messages[0].content).toContain('卡拉彼丘');
      expect(body.messages[0].content).toContain('カラピチュー');
    });

    it('辞書ヒントなしでも動作する', async () => {
      const mockResponse = {
        choices: [{ message: { content: '你好' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translate('こんにちは', 'ja', 'zh');

      expect(result).toBe('你好');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      // 辞書関連の内容がプロンプトに含まれていないことを確認
      expect(body.messages[0].content).not.toContain('Use these translations');
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
          json: async () => ({ choices: [{ message: { content: '成功了' } }] }), // 中国語で成功
        });

      const result = await client.translate('テスト', 'ja', 'zh');

      expect(result).toBe('成功了');
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
          json: async () => ({ choices: [{ message: { content: '成功了' } }] }), // 中国語で成功
        });

      const result = await client.translate('テスト', 'ja', 'zh');

      expect(result).toBe('成功了');
      // 初回 + 2回リトライ = 3回
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('翻訳結果の検証', () => {
    it('元テキストと翻訳結果が同一の場合はエラーを投げる', async () => {
      const originalText = '你好世界';
      const mockResponse = {
        choices: [
          {
            message: {
              content: '你好世界', // 元テキストと同じ
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(
        client.translate(originalText, 'zh', 'ja')
      ).rejects.toThrow('Translation failed: output is identical to input');
    });

    it('日本語翻訳時に日本語文字が全く含まれない場合はエラーを投げる', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'English only text', // 英語のみ（日本語文字なし）
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(
        client.translate('你好世界', 'zh', 'ja')
      ).rejects.toThrow('Translation failed: output does not contain Japanese characters');
    });

    it('中国語翻訳時に中国語文字が含まれない場合はエラーを投げる', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'English text', // 英語（中国語なし、元テキストとも異なる）
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(
        client.translate('Hello World', 'en', 'zh')
      ).rejects.toThrow('Translation failed: output does not contain Chinese characters');
    });

    it('日本語翻訳で漢字+ひらがな・カタカナがあれば成功', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '世界こんにちは', // 漢字+ひらがな
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translate('你好世界', 'zh', 'ja');
      expect(result).toBe('世界こんにちは');
    });

    it('日本語翻訳で漢字のみでも成功（固有名詞など）', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '東京', // 漢字のみ
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translate('Tokyo', 'en', 'ja');
      expect(result).toBe('東京');
    });

    it('中国語翻訳で漢字が含まれていれば成功', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '你好世界',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translate('こんにちは世界', 'ja', 'zh');
      expect(result).toBe('你好世界');
    });
  });

  describe('translateWithAutoDetect', () => {
    it('should translate Japanese to Chinese', async () => {
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

      const result = await client.translateWithAutoDetect('こんにちは');

      expect(result).toBe('你好');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.temperature).toBe(0);
      expect(body.stop).toBeUndefined();
    });

    it('should translate Chinese to Japanese', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'こんにちは' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translateWithAutoDetect('你好');

      expect(result).toBe('こんにちは');
    });

    it('should throw UnsupportedLanguageError for English', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'UNSUPPORTED_LANGUAGE' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(client.translateWithAutoDetect('Hello')).rejects.toThrow(
        'Language not supported by AI detection'
      );
    });

    it('should skip filler lines and extract translation', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Sure, here is the translation:\n你好',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translateWithAutoDetect('こんにちは');

      expect(result).toBe('你好');
    });

    it('should handle same-line filler and translation', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Translation: 你好' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translateWithAutoDetect('こんにちは');

      expect(result).toBe('你好');
    });

    it('should handle same-line filler variants', async () => {
      // Test "Sure: 你好"
      const mockResponse1 = {
        choices: [{ message: { content: 'Sure: 你好' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse1,
      });

      const result1 = await client.translateWithAutoDetect('こんにちは');
      expect(result1).toBe('你好');

      // Test "OK: こんにちは"
      const mockResponse2 = {
        choices: [{ message: { content: 'OK: こんにちは' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse2,
      });

      const result2 = await client.translateWithAutoDetect('你好');
      expect(result2).toBe('こんにちは');
    });

    it('should handle complex filler chains', async () => {
      // Test "This is the translation: 你好"
      const mockResponse1 = {
        choices: [{ message: { content: 'This is the translation: 你好' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse1,
      });

      const result1 = await client.translateWithAutoDetect('こんにちは');
      expect(result1).toBe('你好');

      // Test "Okay, here is the result: こんにちは"
      const mockResponse2 = {
        choices: [
          { message: { content: 'Okay, here is the result: こんにちは' } },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse2,
      });

      const result2 = await client.translateWithAutoDetect('你好');
      expect(result2).toBe('こんにちは');
    });

    it('should throw ValidationError for English-only response', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is just English text' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(
        client.translateWithAutoDetect('こんにちは')
      ).rejects.toThrow('AI returned non-Japanese/Chinese text');
    });

    it('should throw ValidationError for empty response', async () => {
      const mockResponse = {
        choices: [{ message: { content: '   \n\n   ' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await expect(
        client.translateWithAutoDetect('こんにちは')
      ).rejects.toThrow('AI returned empty translation');
    });

    it('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Request timeout')
      );

      await expect(
        client.translateWithAutoDetect('こんにちは')
      ).rejects.toThrow('Network error during AI detection');
    });

    it('should handle multi-paragraph translation', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '你好\n\n今天天气很好',
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.translateWithAutoDetect(
        'こんにちは\n\n今日はいい天気です'
      );

      expect(result).toBe('你好\n\n今天天气很好');
    });

    it('should include dictionary hint in prompt when provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'ストリノヴァは強い' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const dictionaryHint = 'Use these translations for specific terms:\n- 卡拉/卡拉彼丘 → ストリノヴァ';

      await client.translateWithAutoDetect('卡拉很强', dictionaryHint);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // プロンプトに辞書ヒントが含まれているか確認
      expect(body.messages[1].content).toContain(dictionaryHint);
      expect(body.messages[1].content).toContain('卡拉');
      expect(body.messages[1].content).toContain('ストリノヴァ');
    });

    it('should work without dictionary hint', async () => {
      const mockResponse = {
        choices: [{ message: { content: '你好' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // 辞書ヒントなしで呼び出し
      const result = await client.translateWithAutoDetect('こんにちは');

      expect(result).toBe('你好');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // 辞書関連の内容がプロンプトに含まれていないことを確認
      expect(body.messages[1].content).not.toContain('dictionary');
    });
  });
});
