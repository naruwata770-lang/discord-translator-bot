import { TranslationService } from './translationService';
import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { DictionaryService } from './dictionaryService';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import { MultiTranslateTarget } from '../types/multiTranslation';

// モック設定
jest.mock('./poeApiClient');
jest.mock('./languageDetector');
jest.mock('./rateLimiter');
jest.mock('./dictionaryService');

describe('TranslationService - multiTranslate', () => {
  let service: TranslationService;
  let mockPoeClient: jest.Mocked<PoeApiClient>;
  let mockLanguageDetector: jest.Mocked<LanguageDetector>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockDictionaryService: jest.Mocked<DictionaryService>;

  beforeEach(() => {
    // モックインスタンス作成
    mockPoeClient = new PoeApiClient(
      'mock-key',
      'mock-url',
      'mock-model'
    ) as jest.Mocked<PoeApiClient>;
    mockLanguageDetector = new LanguageDetector() as jest.Mocked<LanguageDetector>;
    mockRateLimiter = new RateLimiter(1, 1000) as jest.Mocked<RateLimiter>;
    mockDictionaryService = new DictionaryService() as jest.Mocked<DictionaryService>;

    // デフォルトのモック挙動
    mockRateLimiter.acquire.mockResolvedValue();
    mockRateLimiter.release.mockImplementation(() => {});
    mockDictionaryService.findMatches.mockReturnValue([]);

    service = new TranslationService(
      mockPoeClient,
      mockLanguageDetector,
      mockRateLimiter,
      false,
      mockDictionaryService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系 - 全翻訳成功', () => {
    it('日本語→中国語+英語の2言語同時翻訳が成功する（targets指定あり）', async () => {
      const text = 'こんにちは';
      const targets: MultiTranslateTarget[] = [
        { lang: 'zh' },
        { lang: 'en' },
      ];

      // モック設定
      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate
        .mockResolvedValueOnce('你好') // 中国語
        .mockResolvedValueOnce('Hello'); // 英語

      const results = await service.multiTranslate(text, targets);

      expect(results).toHaveLength(2);

      // 中国語結果
      expect(results[0]).toEqual({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好',
        glossaryHints: undefined,
      });

      // 英語結果
      expect(results[1]).toEqual({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'en',
        translatedText: 'Hello',
        glossaryHints: undefined,
      });

      // translate()が2回呼ばれていることを確認
      expect(mockPoeClient.translate).toHaveBeenCalledTimes(2);
    });

    it('中国語→日本語+英語の2言語同時翻訳が成功する（targets指定あり）', async () => {
      const text = '你好';
      const targets: MultiTranslateTarget[] = [
        { lang: 'ja' },
        { lang: 'en' },
      ];

      mockLanguageDetector.detect.mockReturnValue('zh');
      mockPoeClient.translate
        .mockResolvedValueOnce('こんにちは')
        .mockResolvedValueOnce('Hello');

      const results = await service.multiTranslate(text, targets);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
      expect(results[0]).toMatchObject({
        sourceLang: 'zh',
        targetLang: 'ja',
      });
      expect(results[1]).toMatchObject({
        sourceLang: 'zh',
        targetLang: 'en',
      });
    });

    it('日本語テキストの自動ターゲット選択（中国語+英語）', async () => {
      const text = 'こんにちは';

      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate
        .mockResolvedValueOnce('你好')
        .mockResolvedValueOnce('Hello');

      const results = await service.multiTranslate(text); // targetsを指定しない

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好',
      });
      expect(results[1]).toMatchObject({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'en',
        translatedText: 'Hello',
      });
    });

    it('中国語テキストの自動ターゲット選択（日本語+英語）', async () => {
      const text = '你好';

      mockLanguageDetector.detect.mockReturnValue('zh');
      mockPoeClient.translate
        .mockResolvedValueOnce('こんにちは')
        .mockResolvedValueOnce('Hello');

      const results = await service.multiTranslate(text); // targetsを指定しない

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        status: 'success',
        sourceLang: 'zh',
        targetLang: 'ja',
        translatedText: 'こんにちは',
      });
      expect(results[1]).toMatchObject({
        status: 'success',
        sourceLang: 'zh',
        targetLang: 'en',
        translatedText: 'Hello',
      });
    });

    it('辞書マッチがある場合、glossaryHintsが含まれる', async () => {
      const text = 'Strinovaは楽しいゲームです';
      const targets: MultiTranslateTarget[] = [{ lang: 'zh' }];

      mockLanguageDetector.detect.mockReturnValue('ja');
      mockDictionaryService.findMatches.mockReturnValue([
        {
          entry: {
            id: 'strinova_game',
            aliases: { ja: ['ストリノヴァ'], zh: ['卡拉彼丘'], en: ['Strinova'] },
            targets: { ja: 'ストリノヴァ', zh: '卡拉彼丘', en: 'Strinova' },
            category: 'game_name',
          },
          matchedLanguage: 'ja',
          matchedTerm: 'Strinova',
          targetTerm: '卡拉彼丘',
          targetLanguage: 'zh',
        },
      ]);
      mockPoeClient.translate.mockResolvedValue('卡拉彼丘是一个有趣的游戏');

      const results = await service.multiTranslate(text, targets);

      expect(results[0].status).toBe('success');
      if (results[0].status === 'success') {
        expect(results[0].sourceLang).toBe('ja');
        expect(results[0].targetLang).toBe('zh');
        expect(results[0].translatedText).toBe('卡拉彼丘是一个有趣的游戏');
        expect(results[0].glossaryHints).toHaveLength(1);
        expect(results[0].glossaryHints![0].matchedTerm).toBe('Strinova');
        expect(results[0].glossaryHints![0].targetTerm).toBe('卡拉彼丘');
      }
    });
  });

  describe('エラーハンドリング', () => {
    it('言語検出失敗時、全ての結果がエラーになる', async () => {
      const text = 'Unknown language text';
      const targets: MultiTranslateTarget[] = [
        { lang: 'zh' },
        { lang: 'en' },
      ];

      mockLanguageDetector.detect.mockReturnValue('unknown');

      const results = await service.multiTranslate(text, targets);

      expect(results).toHaveLength(2);

      results.forEach((result) => {
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.errorCode).toBe(ErrorCode.INVALID_INPUT);
          expect(result.errorMessage).toBe('Language could not be detected');
          expect(result.sourceLang).toBe('unknown');
        }
      });
    });

    it('一部の翻訳が失敗しても他の翻訳は成功する（部分成功）', async () => {
      const text = 'こんにちは';
      const targets: MultiTranslateTarget[] = [
        { lang: 'zh' },
        { lang: 'en' },
      ];

      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate
        .mockResolvedValueOnce('你好') // 中国語成功
        .mockRejectedValueOnce(
          new TranslationError('API timeout', ErrorCode.API_ERROR)
        ); // 英語失敗

      const results = await service.multiTranslate(text, targets);

      expect(results).toHaveLength(2);

      // 中国語は成功
      expect(results[0]).toEqual({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好',
        glossaryHints: undefined,
      });

      // 英語は失敗
      expect(results[1].status).toBe('error');
      if (results[1].status === 'error') {
        expect(results[1].errorCode).toBe(ErrorCode.API_ERROR);
        expect(results[1].errorMessage).toBe('API timeout');
        expect(results[1].targetLang).toBe('en');
      }
    });

    it('全ての翻訳が失敗する場合', async () => {
      const text = 'こんにちは';
      const targets: MultiTranslateTarget[] = [
        { lang: 'zh' },
        { lang: 'en' },
      ];

      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockRejectedValue(
        new TranslationError('API service unavailable', ErrorCode.API_ERROR)
      );

      const results = await service.multiTranslate(text, targets);

      expect(results).toHaveLength(2);

      results.forEach((result) => {
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.errorCode).toBe(ErrorCode.API_ERROR);
          expect(result.errorMessage).toBe('API service unavailable');
        }
      });
    });
  });

  describe('並列実行', () => {
    it('複数の翻訳が並列に実行される', async () => {
      const text = 'こんにちは';
      const targets: MultiTranslateTarget[] = [
        { lang: 'zh' },
        { lang: 'en' },
      ];

      mockLanguageDetector.detect.mockReturnValue('ja');

      // Promise解決のタイミングを制御
      let resolveZh: (value: string) => void;
      let resolveEn: (value: string) => void;

      const zhPromise = new Promise<string>((resolve) => {
        resolveZh = resolve;
      });
      const enPromise = new Promise<string>((resolve) => {
        resolveEn = resolve;
      });

      mockPoeClient.translate
        .mockReturnValueOnce(zhPromise)
        .mockReturnValueOnce(enPromise);

      const resultPromise = service.multiTranslate(text, targets);

      // 両方のtranslate()が呼ばれる前に解決される
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPoeClient.translate).toHaveBeenCalledTimes(2);

      // 並列実行なので両方解決する
      resolveZh!('你好');
      resolveEn!('Hello');

      const results = await resultPromise;

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
    });
  });

  describe('辞書サービスなしの場合', () => {
    it('辞書サービスがない場合でも正常動作する', async () => {
      const serviceWithoutDict = new TranslationService(
        mockPoeClient,
        mockLanguageDetector,
        mockRateLimiter,
        false
        // dictionaryService なし
      );

      const text = 'こんにちは';
      const targets: MultiTranslateTarget[] = [{ lang: 'zh' }];

      mockLanguageDetector.detect.mockReturnValue('ja');
      mockPoeClient.translate.mockResolvedValue('你好');

      const results = await serviceWithoutDict.multiTranslate(text, targets);

      expect(results[0]).toEqual({
        status: 'success',
        sourceLang: 'ja',
        targetLang: 'zh',
        translatedText: '你好',
        glossaryHints: undefined,
      });
    });
  });
});
