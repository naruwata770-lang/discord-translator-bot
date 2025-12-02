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

    it('漢字のみで日本語特有のパターンがあれば日本語と判定する', () => {
      expect(detector.detect('日本語')).toBe('ja');
      expect(detector.detect('日本人')).toBe('ja');
      expect(detector.detect('東京')).toBe('ja');
      expect(detector.detect('会社')).toBe('ja');
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

    it('簡体字を含む文章を中国語と判定する', () => {
      expect(detector.detect('这个东西坏了')).toBe('zh');
      expect(detector.detect('彻底解决问题')).toBe('zh');
    });

    it('中国語特有の単語パターンを検出する', () => {
      expect(detector.detect('我要学习')).toBe('zh');
      expect(detector.detect('再来一次')).toBe('zh');
    });

    it('中国語の文法パターン「在+動詞」を検出する', () => {
      expect(detector.detect('我在外地一般会去当地的公园或者江边')).toBe('zh');
      expect(detector.detect('我在看书')).toBe('zh');
    });

    it('中国語の文法パターン「会+動詞」を検出する', () => {
      expect(detector.detect('我会说中文')).toBe('zh');
      expect(detector.detect('他会去')).toBe('zh');
    });

    it('中国語の「或者」「当地」などの語彙を検出する', () => {
      expect(detector.detect('或者明天')).toBe('zh');
      expect(detector.detect('当地人')).toBe('zh');
    });

    it('簡体字と日本語句読点が混在する場合は簡体字を優先して中国語と判定', () => {
      expect(detector.detect('哦哦哦 要坏掉了 再、再多一点')).toBe('zh');
      expect(detector.detect('弄坏了、真的')).toBe('zh');
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
