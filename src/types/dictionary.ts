/**
 * 翻訳辞書の型定義
 */

/**
 * 言語コード
 */
export type LanguageCode = 'ja' | 'zh' | 'en';

/**
 * 言語別のエイリアス（別名）リスト
 * 例: { zh: ['卡拉', '卡拉彼丘'], ja: ['信長'] }
 */
export type LanguageAliases = Partial<Record<LanguageCode, string[]>>;

/**
 * 言語別の翻訳ターゲット
 * 例: { ja: 'ストリノヴァ', zh: '卡拉彼丘', en: 'Strinova' }
 */
export type LanguageTargets = Partial<Record<LanguageCode, string>>;

/**
 * 辞書エントリのカテゴリ
 */
export type DictionaryCategory =
  | 'game_name' // ゲーム名
  | 'character' // キャラクター名
  | 'game_term' // ゲーム用語
  | 'location' // 場所
  | 'item' // アイテム
  | 'other'; // その他

/**
 * 辞書の1エントリ
 */
export interface DictionaryEntry {
  /** 一意識別子（例: 'strinova_game'） */
  id: string;

  /** 言語別のエイリアスリスト */
  aliases: LanguageAliases;

  /** 言語別の翻訳ターゲット */
  targets: LanguageTargets;

  /** カテゴリ（省略可） */
  category?: DictionaryCategory;

  /** メモ（省略可） */
  note?: string;
}

/**
 * 辞書ファイル全体の構造
 */
export interface Dictionary {
  /** 辞書名 */
  name: string;

  /** バージョン */
  version: string;

  /** 説明（省略可） */
  description?: string;

  /** エントリリスト */
  entries: DictionaryEntry[];
}

/**
 * マッチした辞書エントリの情報
 */
export interface DictionaryMatch {
  /** マッチしたエントリ */
  entry: DictionaryEntry;

  /** マッチした言語 */
  matchedLanguage: LanguageCode;

  /** マッチした用語（元のテキスト） */
  matchedTerm: string;

  /** 翻訳先の用語（ターゲット言語での表現） */
  targetTerm: string;

  /** ターゲット言語 */
  targetLanguage: LanguageCode;
}
