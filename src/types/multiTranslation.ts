/**
 * 2言語同時翻訳機能の型定義
 */

import { DictionaryMatch } from './dictionary';
import { ErrorCode } from './index';

/**
 * 翻訳ターゲット言語
 */
export interface MultiTranslateTarget {
  lang: 'ja' | 'zh' | 'en';
  outputFormat?: 'text' | 'markdown';
}

/**
 * 翻訳結果（Discriminated Union）
 *
 * status で分岐することで型安全性を確保
 */
export type MultiTranslationResult =
  | {
      status: 'success';
      sourceLang: string;
      targetLang: string;
      translatedText: string;
      glossaryHints?: DictionaryMatch[];
    }
  | {
      status: 'error';
      sourceLang: string;
      targetLang: string;
      errorCode: ErrorCode;
      errorMessage: string;
    };
