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

    // ひらがな・カタカナがあれば日本語
    if (hasHiragana || hasKatakana) {
      return 'ja';
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
      // 常用漢字の頻度で判定（日本語に多い漢字）
      const jpCommonKanji = /[人日本語一二三時間会社]/;
      const jpKanjiCount = (text.match(jpCommonKanji) || []).length;

      // 日本語でよく使われる漢字が多ければ日本語と判定
      if (jpKanjiCount > 0) {
        return 'ja';
      }

      // それ以外は中国語と判定
      return 'zh';
    }

    // デフォルト: 日本語
    return 'ja';
  }
}
