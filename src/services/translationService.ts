import { PoeApiClient } from './poeApiClient';
import { LanguageDetector } from './languageDetector';
import { RateLimiter } from './rateLimiter';
import { TranslationError } from '../utils/errors';
import { ErrorCode, TranslationResult } from '../types';

export interface TranslationOptions {
  sourceLang?: string;
  targetLang?: string;
}

export class TranslationService {
  constructor(
    private poeClient: PoeApiClient,
    private languageDetector: LanguageDetector,
    private rateLimiter: RateLimiter
  ) {}

  async translate(
    text: string,
    options?: TranslationOptions
  ): Promise<TranslationResult> {
    // レート制限チェック
    await this.rateLimiter.acquire();

    try {
      // 言語検出（sourceLangが指定されていない場合のみ）
      const sourceLang =
        options?.sourceLang || this.languageDetector.detect(text);

      // 翻訳先言語決定（targetLangが指定されていない場合のみ）
      const targetLang =
        options?.targetLang || this.determineTargetLanguage(sourceLang);

      // 翻訳実行
      const translatedText = await this.poeClient.translate(
        text,
        sourceLang,
        targetLang
      );

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
