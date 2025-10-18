import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { DictionaryService } from './dictionaryService';
import { TranslationError } from '../utils/errors';
import { UnsupportedLanguageError, ValidationError } from './errors';
import { ErrorCode, TranslationResult } from '../types';
import { LanguageCode } from '../types/dictionary';
import logger from '../utils/logger';

export interface TranslationOptions {
  sourceLang?: string;
  targetLang?: string;
}

export class TranslationService {
  constructor(
    private poeClient: PoeApiClient,
    private languageDetector: LanguageDetector,
    private rateLimiter: RateLimiter,
    private useAiDetection: boolean = false,
    private dictionaryService?: DictionaryService
  ) {}

  async translate(
    text: string,
    options?: TranslationOptions
  ): Promise<TranslationResult> {
    // レート制限チェック
    await this.rateLimiter.acquire();

    try {
      // AI検出モードの場合
      if (this.useAiDetection && !options?.sourceLang) {
        try {
          const startTime = Date.now();

          // 辞書マッチングを試みる
          let dictionaryHint: string | undefined;
          if (this.dictionaryService) {
            // 言語を簡易検出（日本語or中国語のみ）
            const detectedLang = this.detectSimpleLanguage(text);
            if (detectedLang) {
              const targetLang = detectedLang === 'ja' ? 'zh' : 'ja';
              const matches = this.dictionaryService.findMatches(
                text,
                detectedLang,
                targetLang as LanguageCode
              );
              if (matches.length > 0) {
                dictionaryHint = this.dictionaryService.generatePromptHint(matches);
                logger.debug('Dictionary matches found', {
                  count: matches.length,
                  terms: matches.map((m) => m.matchedTerm),
                });
              }
            }
          }

          const translatedText =
            await this.poeClient.translateWithAutoDetect(text, dictionaryHint);
          const responseTime = Date.now() - startTime;

          logger.info('AI detection succeeded', {
            method: 'ai',
            textLength: text.length,
            responseTime,
          });

          // AI検出では言語メタデータが取得できないため、'ai-inferred'として返す
          return {
            translatedText,
            sourceLang: 'ai-inferred',
            targetLang: 'ai-inferred',
          };
        } catch (error) {
          // UNSUPPORTED_LANGUAGEは再スローしてメッセージスキップ
          if (error instanceof UnsupportedLanguageError) {
            logger.info('Unsupported language detected by AI', {
              textSample: text.substring(0, 50),
            });
            throw new TranslationError(
              'Language not supported',
              ErrorCode.INVALID_INPUT,
              error
            );
          }

          // その他のエラー（ValidationError、タイムアウトなど）はフォールバック
          logger.warn('AI detection failed, falling back to rule-based', {
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.name : 'Unknown',
          });
          // フォールバックへ進む
        }
      }

      // ルールベース検出
      // 言語検出（sourceLangが指定されていない場合のみ）
      const sourceLang =
        options?.sourceLang || this.languageDetector.detect(text);

      // 言語が不明な場合はエラーをスロー（英語など、日中以外の言語）
      if (sourceLang === 'unknown') {
        throw new TranslationError(
          'Language could not be detected',
          ErrorCode.INVALID_INPUT
        );
      }

      // 翻訳先言語決定（targetLangが指定されていない場合のみ）
      const targetLang =
        options?.targetLang || this.determineTargetLanguage(sourceLang);

      // 翻訳実行
      const translatedText = await this.poeClient.translate(
        text,
        sourceLang,
        targetLang
      );

      logger.info('Rule-based detection succeeded', {
        method: 'rule-based',
        sourceLang,
        targetLang,
        textLength: text.length,
      });

      return {
        translatedText,
        sourceLang,
        targetLang,
      };
    } catch (error) {
      // すでにTranslationErrorの場合はそのまま再スロー
      if (error instanceof TranslationError) {
        throw error;
      }

      // その他のエラーは汎用的なAPI_ERRORでラップ
      throw new TranslationError(
        'Translation failed',
        ErrorCode.API_ERROR,
        error as Error
      );
    } finally {
      // エラーの有無に関わらず必ずrelease
      this.rateLimiter.release();
    }
  }

  private determineTargetLanguage(sourceLang: string): string {
    // 日本語→中国語、中国語→日本語、その他→日本語
    if (sourceLang === 'ja') {
      return 'zh';
    } else if (sourceLang === 'zh') {
      return 'ja';
    } else {
      // 英語など、その他の言語は日本語に翻訳
      return 'ja';
    }
  }

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
}
