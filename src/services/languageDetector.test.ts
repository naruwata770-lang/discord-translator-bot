import { LanguageDetector } from './languageDetector';

describe('LanguageDetector', () => {
  let detector: LanguageDetector;

  beforeEach(() => {
    detector = new LanguageDetector();
  });

  describe('日本語の検出', () => {
    it('ひらがなを含む文章を日本語と判定する', () => {
      expect(detector.detect('こんにちは')).toBe('ja');
      expect(detector.detect('今日はいい天気ですね')).toBe('ja');
    });

    it('カタカナを含む文章を日本語と判定する', () => {
      expect(detector.detect('コンピュータ')).toBe('ja');
      expect(detector.detect('カタカナです')).toBe('ja');
    });

    it('日本語句読点を含む文章を日本語と判定する', () => {
      expect(detector.detect('今日、会議があります。')).toBe('ja');
      expect(detector.detect('「こんにちは」と言った')).toBe('ja');
    });

    it('漢字のみでも日本語句読点があれば日本語と判定する', () => {
      expect(detector.detect('明日、会議')).toBe('ja');
    });

    it('漢字のみで日本語によく使われる漢字があれば日本語と判定する', () => {
      expect(detector.detect('日本語一二三')).toBe('ja');
      expect(detector.detect('人間会社')).toBe('ja');
    });
  });

  describe('中国語の検出', () => {
    it('中国語句読点を含む文章を中国語と判定する', () => {
      expect(detector.detect('你好，世界！')).toBe('zh');
      expect(detector.detect('这是中文。')).toBe('zh');
    });

    it('簡体字のみで中国語句読点があれば中国語と判定する', () => {
      expect(detector.detect('学习，工作')).toBe('zh');
    });

    it('漢字のみで日本語特有の漢字がなければ中国語と判定する', () => {
      expect(detector.detect('学习工作')).toBe('zh');
    });
  });

  describe('エッジケース', () => {
    it('ひらがなとカタカナの混合文を日本語と判定する', () => {
      expect(detector.detect('こんにちはコンピュータ')).toBe('ja');
    });

    it('漢字とひらがなの混合文を日本語と判定する', () => {
      expect(detector.detect('今日はいい天気')).toBe('ja');
    });

    it('判定不能な場合は unknown を返す（英語など）', () => {
      expect(detector.detect('ABC123')).toBe('unknown');
      expect(detector.detect('Hello World')).toBe('unknown');
      expect(detector.detect('')).toBe('unknown');
    });

    it('空白のみの文字列は unknown を返す', () => {
      expect(detector.detect('   ')).toBe('unknown');
    });
  });
});
