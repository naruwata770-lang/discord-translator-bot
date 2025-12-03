import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { DictionaryService } from './dictionaryService';
import { TranslationError } from '../utils/errors';
import { UnsupportedLanguageError } from './errors';
import { ErrorCode } from '../types';
import { LanguageCode, DictionaryMatch } from '../types/dictionary';
import {
  MultiTranslateTarget,
  MultiTranslationResult,
} from '../types/multiTranslation';
import logger from '../utils/logger';

export class TranslationService {
  constructor(
    private poeClient: PoeApiClient,
    private languageDetector: LanguageDetector,
    private rateLimiter: RateLimiter,
    private useAiDetection: boolean = false,
    private dictionaryService?: DictionaryService
  ) {}

  /**
   * 複数言語への同時翻訳（3ステップフロー）
   * 1. 言語検出（AI or ルールベース）
   * 2. 日中翻訳（ja→zh または zh→ja）
   * 3. 英語翻訳
   *
   * @param text 翻訳対象テキスト
   * @param targets 翻訳先言語のリスト（省略時は自動決定: 日本語→中国語+英語、中国語→日本語+英語）
   * @returns 各言語への翻訳結果（成功/失敗を含む）
   */
  async multiTranslate(
    text: string,
    targets?: MultiTranslateTarget[]
  ): Promise<MultiTranslationResult[]> {
    let sourceLang: string;

    // Step 1: 言語検出
    if (this.useAiDetection) {
      try {
        await this.rateLimiter.acquire();
        try {
          const detectedLang = await this.poeClient.detectLanguage(text);

          if (detectedLang === 'unsupported') {
            // AIがunsupportedと判定しても、ルールベースにフォールバック
            // （AIが誤って日本語/中国語をunsupportedと判定する可能性があるため）
            logger.warn('AI detected unsupported, falling back to rule-based', {
              textSample: text.substring(0, 50),
            });
            sourceLang = this.languageDetector.detect(text);
          } else {
            sourceLang = detectedLang;
            logger.info('AI language detection succeeded in multiTranslate', {
              sourceLang,
              textLength: text.length,
            });
          }
        } finally {
          this.rateLimiter.release();
        }
      } catch (error) {
        // UnsupportedLanguageErrorもルールベースにフォールバック
        // （AIの誤判定の可能性があるため）
        if (error instanceof UnsupportedLanguageError) {
          logger.warn('AI threw UnsupportedLanguageError, falling back to rule-based', {
            textSample: text.substring(0, 50),
          });
          sourceLang = this.languageDetector.detect(text);
        } else {
          // その他のエラーもルールベースにフォールバック
          logger.warn('AI detection failed in multiTranslate, falling back to rule-based', {
            error: error instanceof Error ? error.message : String(error),
          });
          sourceLang = this.languageDetector.detect(text);
        }
      }
    } else {
      // AI検出無効時はルールベース検出
      sourceLang = this.languageDetector.detect(text);
    }

    // 言語が不明な場合は全てエラーとして返す
    if (sourceLang === 'unknown') {
      const defaultTargets = targets || [{ lang: 'zh' }, { lang: 'en' }];
      return defaultTargets.map((target) => ({
        status: 'error' as const,
        sourceLang: 'unknown',
        targetLang: target.lang,
        errorCode: ErrorCode.INVALID_INPUT,
        errorMessage: 'Language could not be detected',
      }));
    }

    // Step 2: targetsが指定されていない場合は、ソース言語に基づいて自動決定
    if (!targets) {
      if (sourceLang === 'zh') {
        // 中国語 → 日本語 + 英語
        targets = [{ lang: 'ja' }, { lang: 'en' }];
      } else {
        // 日本語（デフォルト） → 中国語 + 英語
        targets = [{ lang: 'zh' }, { lang: 'en' }];
      }
    }

    // Step 3: 各ターゲット言語に対して翻訳（並列実行）
    const promises = targets.map(async (target) => {
      try {
        // 3.1 辞書マッチング
        let glossaryHints: DictionaryMatch[] | undefined;
        let dictionaryHint: string | undefined;
        if (this.dictionaryService) {
          const matches = this.dictionaryService.findMatches(
            text,
            sourceLang as LanguageCode,
            target.lang
          );
          if (matches.length > 0) {
            glossaryHints = matches;
            dictionaryHint = this.dictionaryService.generatePromptHint(matches);
            logger.debug('Dictionary matches found for multiTranslate', {
              targetLang: target.lang,
              count: matches.length,
              terms: matches.map((m) => m.matchedTerm),
            });
          }
        }

        // 3.2 翻訳実行（辞書ヒントを含めて直接poeClientを呼び出す）
        await this.rateLimiter.acquire();
        try {
          logger.debug('Multi-translate request', {
            sourceLang,
            targetLang: target.lang,
            textLength: text.length,
            hasDictionaryHint: !!dictionaryHint,
          });

          const translatedText = await this.poeClient.translate(
            text,
            sourceLang,
            target.lang,
            dictionaryHint
          );

          logger.debug('Multi-translate result', {
            sourceLang,
            targetLang: target.lang,
            outputLength: translatedText.length,
          });

          // 3.3 成功結果を返す
          return {
            status: 'success' as const,
            sourceLang,
            targetLang: target.lang,
            translatedText,
            glossaryHints,
          };
        } finally {
          this.rateLimiter.release();
        }
      } catch (error) {
        // 3.4 部分的な失敗を許容してエラー結果を返す
        logger.warn('Translation failed for one target in multiTranslate', {
          targetLang: target.lang,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          status: 'error' as const,
          sourceLang,
          targetLang: target.lang,
          errorCode:
            error instanceof TranslationError
              ? error.code
              : ErrorCode.API_ERROR,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        };
      }
    });

    return Promise.all(promises);
  }
}
