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
   * 簡易言語検出（辞書マッチング用）
   * @param text テキスト
   * @returns 'ja' | 'zh' | null
   */
  private detectSimpleLanguage(text: string): LanguageCode | null {
    // ひらがな・カタカナがあれば確実に日本語
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja';
    }

    // 日本語句読点があれば日本語
    if (/[。、]/.test(text)) {
      return 'ja';
    }

    // 中国語句読点があれば中国語
    if (/[，。！？；：]/.test(text)) {
      return 'zh';
    }

    // 漢字のみの場合は既存のLanguageDetectorを使用
    if (/[\u4e00-\u9fff]/.test(text)) {
      const detected = this.languageDetector.detect(text);
      if (detected === 'ja' || detected === 'zh') {
        return detected;
      }
      // LanguageDetectorでも判定できない場合は日本語を優先
      // （日中友達との会話なので、曖昧な場合は日本語が多いと想定）
      return 'ja';
    }

    return null;
  }

  /**
   * 複数言語への同時翻訳
   * @param text 翻訳対象テキスト
   * @param targets 翻訳先言語のリスト（省略時は自動決定: 日本語→中国語+英語、中国語→日本語+英語）
   * @returns 各言語への翻訳結果（成功/失敗を含む）
   */
  async multiTranslate(
    text: string,
    targets?: MultiTranslateTarget[]
  ): Promise<MultiTranslationResult[]> {
    let sourceLang: string;
    let firstTranslationResult: { targetLang: string; translatedText: string } | null = null;

    // 1. AI言語検出を試行（最初の翻訳も同時に取得）
    if (this.useAiDetection) {
      try {
        // 辞書ヒントを準備（簡易言語検出で方向を推定）
        let dictionaryHint: string | undefined;
        if (this.dictionaryService) {
          const estimatedLang = this.detectSimpleLanguage(text);
          if (estimatedLang) {
            const estimatedTarget = estimatedLang === 'ja' ? 'zh' : 'ja';
            const matches = this.dictionaryService.findMatches(
              text,
              estimatedLang,
              estimatedTarget as LanguageCode
            );
            if (matches.length > 0) {
              dictionaryHint = this.dictionaryService.generatePromptHint(matches);
            }
          }
        }

        await this.rateLimiter.acquire();
        try {
          const aiResult = await this.poeClient.translateWithAutoDetect(text, dictionaryHint);
          sourceLang = aiResult.sourceLang;
          firstTranslationResult = {
            targetLang: aiResult.targetLang,
            translatedText: aiResult.translatedText,
          };
          logger.info('AI language detection succeeded in multiTranslate', {
            sourceLang,
            targetLang: aiResult.targetLang,
            textLength: text.length,
          });
        } finally {
          this.rateLimiter.release();
        }
      } catch (error) {
        // UnsupportedLanguageErrorは全結果をエラーで返す
        if (error instanceof UnsupportedLanguageError) {
          logger.info('Unsupported language detected by AI in multiTranslate', {
            textSample: text.substring(0, 50),
          });
          const defaultTargets = targets || [{ lang: 'zh' }, { lang: 'en' }];
          return defaultTargets.map((target) => ({
            status: 'error' as const,
            sourceLang: 'unknown',
            targetLang: target.lang,
            errorCode: ErrorCode.INVALID_INPUT,
            errorMessage: 'Language not supported',
          }));
        }

        // その他のエラーはルールベースにフォールバック
        logger.warn('AI detection failed in multiTranslate, falling back to rule-based', {
          error: error instanceof Error ? error.message : String(error),
        });
        sourceLang = this.languageDetector.detect(text);
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

    // 2. targetsが指定されていない場合は、ソース言語に基づいて自動決定
    if (!targets) {
      if (sourceLang === 'zh') {
        // 中国語 → 日本語 + 英語
        targets = [{ lang: 'ja' }, { lang: 'en' }];
      } else {
        // 日本語（デフォルト） → 中国語 + 英語
        targets = [{ lang: 'zh' }, { lang: 'en' }];
      }
    }

    // 3. 各ターゲット言語に対して翻訳（AI検出で取得済みの結果は再利用）
    const promises = targets.map(async (target) => {
      // AI検出で既に取得済みの翻訳結果があれば再利用
      if (firstTranslationResult && target.lang === firstTranslationResult.targetLang) {
        logger.debug('Reusing AI detection translation result', {
          sourceLang,
          targetLang: target.lang,
        });

        // 辞書マッチング情報を取得
        let glossaryHints: DictionaryMatch[] | undefined;
        if (this.dictionaryService) {
          const matches = this.dictionaryService.findMatches(
            text,
            sourceLang as LanguageCode,
            target.lang
          );
          if (matches.length > 0) {
            glossaryHints = matches;
          }
        }

        return {
          status: 'success' as const,
          sourceLang,
          targetLang: target.lang,
          translatedText: firstTranslationResult.translatedText,
          glossaryHints,
        };
      }

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
