import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { TranslationError } from '../utils/errors';
import { UnsupportedLanguageError, ValidationError } from './errors';
import { ErrorCode, TranslationResult } from '../types';
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
    private useAiDetection: boolean = false
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
          const translatedText =
            await this.poeClient.translateWithAutoDetect(text);
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
}
