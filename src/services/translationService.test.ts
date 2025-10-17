import { TranslationService } from './translationService';
import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';

// モック
jest.mock('./poeApiClient');
jest.mock('./languageDetector');
jest.mock('./rateLimiter');

describe('TranslationService', () => {
  let service: TranslationService;
  let mockPoeClient: jest.Mocked<PoeApiClient>;
  let mockLanguageDetector: jest.Mocked<LanguageDetector>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;

  beforeEach(() => {
    // モックインスタンス作成
    mockPoeClient = new PoeApiClient(
      'test-key',
      'https://api.test.com',
      'test-model'
    ) as jest.Mocked<PoeApiClient>;
    mockLanguageDetector = new LanguageDetector() as jest.Mocked<LanguageDetector>;
    mockRateLimiter = new RateLimiter(1, 1000) as jest.Mocked<RateLimiter>;

    // メソッドをモック化
    mockPoeClient.translate = jest.fn();
    mockLanguageDetector.detect = jest.fn();
    mockRateLimiter.acquire = jest.fn().mockResolvedValue(undefined);
    mockRateLimiter.release = jest.fn();

    // サービスインスタンス作成
    service = new TranslationService(
      mockPoeClient,
      mockLanguageDetector,
      mockRateLimiter
    );
  });

  describe('成功ケース', () => {
    it('日本語→中国語の翻訳が成功する', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockResolvedValue('你好');

      const result = await service.translate('こんにちは');

      expect(result).toEqual({
        translatedText: '你好',
        sourceLang: 'ja',
        targetLang: 'zh',
      });
      expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(1);
      expect(mockLanguageDetector.detect).toHaveBeenCalledWith('こんにちは');
      expect(mockPoeClient.translate).toHaveBeenCalledWith(
        'こんにちは',
        'ja',
        'zh'
      );
      expect(mockRateLimiter.release).toHaveBeenCalledTimes(1);
    });

    it('中国語→日本語の翻訳が成功する', async () => {
      mockLanguageDetector.detect.mockReturnValue('zh');
      mockPoeClient.translate.mockResolvedValue('こんにちは');

      const result = await service.translate('你好');

      expect(result).toEqual({
        translatedText: 'こんにちは',
        sourceLang: 'zh',
        targetLang: 'ja',
      });
      expect(mockLanguageDetector.detect).toHaveBeenCalledWith('你好');
      expect(mockPoeClient.translate).toHaveBeenCalledWith('你好', 'zh', 'ja');
    });

    it('sourceLangが指定されている場合は言語検出をスキップする', async () => {
      mockPoeClient.translate.mockResolvedValue('你好');

      const result = await service.translate('こんにちは', {
        sourceLang: 'ja',
      });

      expect(result).toEqual({
        translatedText: '你好',
        sourceLang: 'ja',
        targetLang: 'zh',
      });
      expect(mockLanguageDetector.detect).not.toHaveBeenCalled();
      expect(mockPoeClient.translate).toHaveBeenCalledWith(
        'こんにちは',
        'ja',
        'zh'
      );
    });

    it('targetLangが指定されている場合は自動判定をスキップする', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockResolvedValue('Hello');

      const result = await service.translate('こんにちは', {
        targetLang: 'en',
      });

      expect(result).toEqual({
        translatedText: 'Hello',
        sourceLang: 'ja',
        targetLang: 'en',
      });
      expect(mockPoeClient.translate).toHaveBeenCalledWith(
        'こんにちは',
        'ja',
        'en'
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('PoeApiClientからのTranslationErrorをそのまま再スローする', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      const apiError = new TranslationError(
        'API Error',
        ErrorCode.NETWORK_ERROR
      );
      mockPoeClient.translate.mockRejectedValue(apiError);

      await expect(service.translate('test')).rejects.toThrow(apiError);
      expect(mockRateLimiter.release).toHaveBeenCalledTimes(1);
    });

    it('一般的なエラーをTranslationErrorでラップする', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      const genericError = new Error('Generic error');
      mockPoeClient.translate.mockRejectedValue(genericError);

      try {
        await service.translate('test');
        fail('Expected TranslationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TranslationError);
        expect((error as TranslationError).code).toBe(ErrorCode.API_ERROR);
        expect((error as TranslationError).message).toBe('Translation failed');
        expect((error as TranslationError).originalError).toBe(genericError);
      }

      expect(mockRateLimiter.release).toHaveBeenCalledTimes(1);
    });

    it('エラーが発生してもrelease()が必ず呼ばれる', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockRejectedValue(new Error('Test error'));

      try {
        await service.translate('test');
      } catch (error) {
        // エラーを無視
      }

      expect(mockRateLimiter.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('レート制限', () => {
    it('翻訳前にacquire()を呼び出す', async () => {
      const callOrder: string[] = [];

      mockRateLimiter.acquire.mockImplementation(async () => {
        callOrder.push('acquire');
      });
      mockPoeClient.translate.mockImplementation(async () => {
        callOrder.push('translate');
        return '你好';
      });
      mockRateLimiter.release.mockImplementation(() => {
        callOrder.push('release');
      });
      mockLanguageDetector.detect.mockReturnValue('ja');

      await service.translate('こんにちは');

      expect(callOrder).toEqual(['acquire', 'translate', 'release']);
    });

    it('acquire()が失敗した場合はrelease()を呼ばない', async () => {
      mockRateLimiter.acquire.mockRejectedValue(new Error('Acquire failed'));

      try {
        await service.translate('test');
      } catch (error) {
        // エラーを無視
      }

      expect(mockRateLimiter.release).not.toHaveBeenCalled();
    });
  });

  describe('言語判定ロジック', () => {
    it('日本語の場合は中国語に翻訳する', async () => {
      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockResolvedValue('你好');

      const result = await service.translate('こんにちは');

      expect(result.targetLang).toBe('zh');
    });

    it('中国語の場合は日本語に翻訳する', async () => {
      mockLanguageDetector.detect.mockReturnValue('zh');
      mockPoeClient.translate.mockResolvedValue('こんにちは');

      const result = await service.translate('你好');

      expect(result.targetLang).toBe('ja');
    });

    it('英語の場合は日本語に翻訳する（デフォルト）', async () => {
      mockLanguageDetector.detect.mockReturnValue('en');
      mockPoeClient.translate.mockResolvedValue('こんにちは');

      const result = await service.translate('Hello');

      expect(result.targetLang).toBe('ja');
    });
  });
});
