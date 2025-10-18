export class LanguageDetector {
  detect(text: string): string {
    // 文字種を判定
    const hasHiragana = /[\u3040-\u309f]/.test(text);
    const hasKatakana = /[\u30a0-\u30ff]/.test(text);
    const hasKanji = /[\u4e00-\u9faf]/.test(text);

    // 日本語固有の句読点（「。」は中国語でも使われるため除外）
    const hasJapanesePunctuation = /[、「」『』・]/.test(text);

    // 中国語固有の句読点
    const hasChinesePunctuation = /[，。？！：；""''【】（）]/.test(text);

    // 簡体字（中国語特有の簡略化された漢字で、日本語では使われないもの）
    // 坏(壊)、弄(いじる)、彻(徹)、过(過)、这(這)、为(為)、们(們)、务(務)、产(產)、实(實)、际(際)、关(關)、现(現)、发(發)、经(經)など
    // 注意：「国」「時」「会」「動」「電」「開」などは日本語でも使われるため除外
    const hasSimplifiedChinese = /[坏弄彻过这为们务产实际关现发经啊哦吗呢]/.test(text);

    // ひらがな・カタカナがあれば日本語
    if (hasHiragana || hasKatakana) {
      return 'ja';
    }

    // 簡体字があれば中国語（日本語句読点より優先）
    if (hasSimplifiedChinese) {
      return 'zh';
    }

    // 日本語句読点があれば日本語（漢字のみでも判定可能）
    if (hasJapanesePunctuation) {
      return 'ja';
    }

    // 中国語句読点があれば中国語
    if (hasChinesePunctuation) {
      return 'zh';
    }

    // 漢字のみの場合
    if (hasKanji) {
      // 日本語特有の漢字組み合わせパターン
      // 「の」「を」「は」「が」などの助詞は既にひらがなチェックで除外済み
      // ここでは送り仮名なしで日本語と判断できる特徴的な単語を検出
      const jpSpecificPattern = /[日本語時間会社今明後東西南北]/;
      const jpPatternMatch = text.match(jpSpecificPattern);

      // 中国語特有の単語パターン
      const zhSpecificPattern = /[要用再了|吗呢啊]/;
      const zhPatternMatch = text.match(zhSpecificPattern);

      // 中国語パターンが優先
      if (zhPatternMatch && zhPatternMatch.length > 0) {
        return 'zh';
      }

      // 日本語パターンがあり、中国語パターンがない場合
      if (jpPatternMatch && jpPatternMatch.length > 0) {
        return 'ja';
      }

      // どちらのパターンもない場合、デフォルトで中国語
      // （簡体字圏の方が漢字のみで書く傾向が強いため）
      return 'zh';
    }

    // 日本語・中国語の明確な特徴がない場合（英語など）
    // 翻訳をスキップできるように'unknown'を返す
    return 'unknown';
  }
}
