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

  describe('検証エラー時のリトライ', () => {
    it('検証エラーが発生した場合、プロンプトを変えて最大2回リトライする', async () => {
      // 1回目: 検証失敗（元テキストと同じ）
      // 2回目: 検証失敗（元テキストと同じ）
      // 3回目: 成功
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const result = await client.translate('你好世界', 'zh', 'ja');

      expect(result).toBe('こんにちは世界');
      // 1回目（通常プロンプト） + 2回目（強化プロンプト） + 3回目（成功） = 3回
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('検証エラーで2回リトライしても失敗した場合はエラーを投げる', async () => {
      // 4回とも検証失敗（maxRetries=3なので、初回+3回リトライ=4回）
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        });

      await expect(
        client.translate('你好世界', 'zh', 'ja')
      ).rejects.toThrow('Translation failed: output is identical to input');

      // 最大4回試行（初回 + 3回リトライ）
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('1回目で成功した場合はリトライしない', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
      });

      const result = await client.translate('你好世界', 'zh', 'ja');

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('プロンプトバリエーション', () => {
    it('2回目のリトライ時には強化プロンプトが使用される', async () => {
      // 1回目: 検証失敗
      // 2回目: 成功
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const result = await client.translate('你好世界', 'zh', 'ja');

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // 2回目のプロンプトには"STRICT REQUIREMENTS"が含まれている
      const secondCallArgs = (global.fetch as jest.Mock).mock.calls[1][1];
      const secondBody = JSON.parse(secondCallArgs.body);
      expect(secondBody.messages[0].content).toContain('STRICT REQUIREMENTS');
    });

    it('ネットワークエラーのリトライでは通常プロンプトを使い続ける', async () => {
      // 1回目: ネットワークエラー
      // 2回目: 成功
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const result = await client.translate('你好世界', 'zh', 'ja');

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // 2回目のプロンプトにも"STRICT REQUIREMENTS"は含まれない（通常プロンプト）
      const secondCallArgs = (global.fetch as jest.Mock).mock.calls[1][1];
      const secondBody = JSON.parse(secondCallArgs.body);
      expect(secondBody.messages[0].content).not.toContain('STRICT REQUIREMENTS');
      expect(secondBody.messages[0].content).toContain('IMPORTANT RULES');
    });

    it('検証エラー→ネットワークエラー→成功でも強化プロンプトを使う', async () => {
      // 1回目: 検証失敗
      // 2回目: ネットワークエラー（強化プロンプト使用）
      // 3回目: 成功（強化プロンプト継続）
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const result = await client.translate('你好世界', 'zh', 'ja');

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // 2回目・3回目ともに強化プロンプト
      const secondCallArgs = (global.fetch as jest.Mock).mock.calls[1][1];
      const secondBody = JSON.parse(secondCallArgs.body);
      expect(secondBody.messages[0].content).toContain('STRICT REQUIREMENTS');

      const thirdCallArgs = (global.fetch as jest.Mock).mock.calls[2][1];
      const thirdBody = JSON.parse(thirdCallArgs.body);
      expect(thirdBody.messages[0].content).toContain('STRICT REQUIREMENTS');
    });
  });

  describe('リトライ時の待機時間', () => {
    it('検証エラー時は500msの短い待機時間でリトライする', async () => {
      // sleepモックを解除して実際の待機時間を測定
      jest.restoreAllMocks();

      // 1回目: 検証失敗
      // 2回目: 成功
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '你好世界' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const startTime = Date.now();
      const result = await client.translate('你好世界', 'zh', 'ja');
      const elapsed = Date.now() - startTime;

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // 500ms程度の待機時間（誤差を考慮して400-700msの範囲）
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(1500);
    });

    it('ネットワークエラー時は指数バックオフでリトライする', async () => {
      // sleepモックを解除して実際の待機時間を測定
      jest.restoreAllMocks();

      // 1回目: ネットワークエラー
      // 2回目: 成功
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'こんにちは世界' } }] }),
        });

      const startTime = Date.now();
      const result = await client.translate('你好世界', 'zh', 'ja');
      const elapsed = Date.now() - startTime;

      expect(result).toBe('こんにちは世界');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // 指数バックオフ: 1000ms程度の待機時間（誤差を考慮して900-1500msの範囲）
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('翻訳結果の検証', () => {
    it('元テキストと翻訳結果が同一の場合はVALIDATION_ERRORを投げる', async () => {
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

      (global.fetch as jest.Mock).mockResolvedValue({
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

      // maxRetries=3なので、4回とも同じ英語のレスポンスを返す
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
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

      // maxRetries=3なので、4回とも同じ英語のレスポンスを返す
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
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

  describe('detectLanguage', () => {
    it('日本語テキストを正しく検出する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'ja' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(10);
    });

    it('中国語テキストを正しく検出する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'zh' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('你好');

      expect(result).toBe('zh');
    });

    it('英語テキストでunsupportedを返す', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'unsupported' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('Hello World');

      expect(result).toBe('unsupported');
    });

    it('引用符付きの結果を正しく処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: '"ja"' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
    });

    it('大文字の結果を正しく処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'JA' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
    });

    it('APIエラー時（リトライ超過）にTranslationErrorを投げる', async () => {
      // 4回（初回+3回リトライ）全て500エラーを返す
      for (let i = 0; i < 4; i++) {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server Error',
          headers: { get: () => null },
        });
      }

      await expect(client.detectLanguage('こんにちは')).rejects.toThrow(
        TranslationError
      );
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('認証エラー時にAUTH_ERRORを投げる', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
        headers: { get: () => null },
      });

      try {
        await client.detectLanguage('こんにちは');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.AUTH_ERROR);
      }
    });

    it('ネットワークエラー時（リトライ超過）にNETWORK_ERRORを投げる', async () => {
      // 4回（初回+3回リトライ）全てネットワークエラー
      for (let i = 0; i < 4; i++) {
        (global.fetch as jest.Mock).mockRejectedValueOnce(
          new Error('Network failure')
        );
      }

      try {
        await client.detectLanguage('こんにちは');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('予想外の言語はunsupportedとして扱う', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'korean' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('안녕하세요');

      expect(result).toBe('unsupported');
    });

    it('バッククォート付きの結果を正しく処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: '`ja`' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
    });

    it('句読点付きの結果を正しく処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'ja.' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
    });

    it('japaneseという回答をjaとして処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'japanese' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
    });

    it('chineseという回答をzhとして処理する', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'chinese' } }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.detectLanguage('你好');

      expect(result).toBe('zh');
    });

    it('500エラーでリトライして成功する', async () => {
      const successResponse = {
        choices: [{ message: { content: 'ja' } }],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server Error',
          headers: { get: () => null },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => successResponse,
        });

      const result = await client.detectLanguage('こんにちは');

      expect(result).toBe('ja');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('429エラーでリトライして成功する', async () => {
      const successResponse = {
        choices: [{ message: { content: 'zh' } }],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limit',
          headers: { get: (name: string) => (name === 'Retry-After' ? '1' : null) },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => successResponse,
        });

      const result = await client.detectLanguage('你好');

      expect(result).toBe('zh');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('認証エラーはリトライしない', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
        headers: { get: () => null },
      });

      await expect(client.detectLanguage('こんにちは')).rejects.toThrow(TranslationError);

      // 認証エラーはリトライしないので1回のみ
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
