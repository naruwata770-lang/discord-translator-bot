import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {
  Dictionary,
  DictionaryEntry,
  DictionaryMatch,
  LanguageCode,
} from '../types/dictionary';
import logger from '../utils/logger';

export class DictionaryService {
  private dictionary: Dictionary | null = null;

  /**
   * YAML辞書ファイルを読み込む
   * @param filePath 辞書ファイルのパス
   * @returns 辞書オブジェクト
   * @throws ファイルが存在しない、YAML構文エラー、バリデーションエラー
   */
  loadDictionary(filePath: string): Dictionary {
    try {
      // ファイル読み込み
      const fileContents = fs.readFileSync(filePath, 'utf8');

      // YAMLパース
      const data = yaml.load(fileContents) as any;

      // バリデーション
      this.validateDictionary(data);

      this.dictionary = data as Dictionary;
      logger.info('Dictionary loaded successfully', {
        name: this.dictionary.name,
        version: this.dictionary.version,
        entriesCount: this.dictionary.entries.length,
      });

      return this.dictionary;
    } catch (error) {
      logger.error('Failed to load dictionary', { filePath, error });
      throw error;
    }
  }

  /**
   * 辞書の構造をバリデーション
   * @param data パースされたYAMLデータ
   * @throws バリデーションエラー
   */
  private validateDictionary(data: any): void {
    // トップレベルの型チェック
    if (!data || typeof data !== 'object') {
      throw new Error(
        'Dictionary validation failed: YAML must contain a valid object'
      );
    }

    // 必須フィールドチェック
    if (!data.name) {
      throw new Error('Dictionary validation failed: "name" is required');
    }
    if (!data.version) {
      throw new Error('Dictionary validation failed: "version" is required');
    }
    if (!data.entries || !Array.isArray(data.entries)) {
      throw new Error(
        'Dictionary validation failed: "entries" must be an array'
      );
    }

    // エントリの重複IDチェック
    const ids = new Set<string>();
    const validLanguages: LanguageCode[] = ['ja', 'zh', 'en'];

    for (const entry of data.entries) {
      if (!entry.id) {
        throw new Error(
          'Dictionary validation failed: all entries must have an "id"'
        );
      }
      if (ids.has(entry.id)) {
        throw new Error(
          `Dictionary validation failed: duplicate id "${entry.id}"`
        );
      }
      ids.add(entry.id);

      // aliasesとtargetsの存在チェック
      if (!entry.aliases) {
        throw new Error(
          `Dictionary validation failed: entry "${entry.id}" must have "aliases"`
        );
      }
      if (!entry.targets) {
        throw new Error(
          `Dictionary validation failed: entry "${entry.id}" must have "targets"`
        );
      }

      // aliasesの詳細チェック
      for (const lang of validLanguages) {
        const aliases = entry.aliases[lang];
        if (aliases !== undefined) {
          // 配列型チェック
          if (!Array.isArray(aliases)) {
            throw new Error(
              `Dictionary validation failed: entry "${entry.id}" aliases.${lang} must be an array`
            );
          }

          // 各エイリアスが非空文字列かチェック
          for (const alias of aliases) {
            if (typeof alias !== 'string' || alias.trim() === '') {
              throw new Error(
                `Dictionary validation failed: entry "${entry.id}" has empty or invalid alias in ${lang}`
              );
            }
          }
        }
      }

      // targetsの詳細チェック
      for (const lang of validLanguages) {
        const target = entry.targets[lang];
        if (target !== undefined) {
          // 文字列型チェック
          if (typeof target !== 'string' || target.trim() === '') {
            throw new Error(
              `Dictionary validation failed: entry "${entry.id}" has empty or invalid target in ${lang}`
            );
          }
        }
      }
    }
  }

  /**
   * メッセージテキストから辞書エントリをマッチング
   * @param text メッセージテキスト
   * @param sourceLang ソース言語
   * @param targetLang ターゲット言語
   * @returns マッチした辞書エントリのリスト
   */
  findMatches(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode
  ): DictionaryMatch[] {
    if (!this.dictionary) {
      logger.warn('Dictionary not loaded, returning empty matches');
      return [];
    }

    const matches: DictionaryMatch[] = [];

    for (const entry of this.dictionary.entries) {
      // ソース言語のエイリアスを取得
      const sourceAliases = entry.aliases[sourceLang];
      if (!sourceAliases || sourceAliases.length === 0) {
        continue;
      }

      // ターゲット言語の翻訳を取得
      const targetTerm = entry.targets[targetLang];
      if (!targetTerm) {
        // ターゲット言語が存在しない場合はスキップ
        continue;
      }

      // 各エイリアスでマッチング
      for (const alias of sourceAliases) {
        if (text.includes(alias)) {
          matches.push({
            entry,
            matchedLanguage: sourceLang,
            matchedTerm: alias,
            targetTerm,
            targetLanguage: targetLang,
          });
        }
      }
    }

    // 長いマッチを優先（「卡拉彼丘」が「卡拉」より優先）
    matches.sort((a, b) => b.matchedTerm.length - a.matchedTerm.length);

    // 重複除去（同じエントリが複数マッチした場合、最長のもののみ残す）
    const uniqueMatches: DictionaryMatch[] = [];
    const seenEntryIds = new Set<string>();

    for (const match of matches) {
      if (!seenEntryIds.has(match.entry.id)) {
        uniqueMatches.push(match);
        seenEntryIds.add(match.entry.id);
      }
    }

    return uniqueMatches;
  }

  /**
   * マッチした辞書エントリからプロンプトヒントを生成
   * @param matches マッチした辞書エントリ
   * @returns プロンプトに追加するヒント文字列
   */
  generatePromptHint(matches: DictionaryMatch[]): string {
    if (matches.length === 0) {
      return '';
    }

    const hints = matches.map((match) => {
      // エイリアスを全て含める
      const sourceAliases = match.entry.aliases[match.matchedLanguage] || [];
      const aliasesText = sourceAliases.join('/');

      return `- ${aliasesText} → ${match.targetTerm}`;
    });

    return `Use these translations for specific terms:\n${hints.join('\n')}`;
  }
}
