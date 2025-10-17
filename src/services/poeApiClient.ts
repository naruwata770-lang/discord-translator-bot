import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import logger from '../utils/logger';

interface PoeApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class PoeApiClient {
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1秒

  constructor(
    private apiKey: string,
    private endpointUrl: string,
    private modelName: string
  ) {}

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const prompt = this.buildPrompt(text, sourceLang, targetLang);

    let lastError: TranslationError | null = null;

    // リトライループ（最大3回）
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.callApi(prompt);
        return this.extractTranslation(response);
      } catch (error) {
        lastError = error as TranslationError;

        // リトライしないエラー
        if (this.shouldNotRetry(lastError)) {
          throw lastError;
        }

        // 最後の試行でエラーが発生した場合
        if (attempt === this.maxRetries) {
          throw lastError;
        }

        // 指数バックオフで待機
        const delay = this.calculateBackoff(attempt);
        logger.warn(`API call failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
        });
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private buildPrompt(
    text: string,
    sourceLang: string,
    targetLang: string
  ): string {
    const langMap: Record<string, string> = {
      ja: 'Japanese',
      zh: 'Chinese',
      en: 'English',
    };

    const sourceLanguage = langMap[sourceLang] || sourceLang;
    const targetLanguage = langMap[targetLang] || targetLang;

    return `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only output the translation, without any explanation or additional text.\n\nText: ${text}`;
  }

  private async callApi(prompt: string): Promise<PoeApiResponse> {
    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        // ステータスコードに応じたErrorCodeを決定
        let errorCode: ErrorCode;
        if (statusCode === 401 || statusCode === 403) {
          errorCode = ErrorCode.AUTH_ERROR;
        } else if (statusCode === 400) {
          errorCode = ErrorCode.INVALID_INPUT;
        } else if (statusCode === 429) {
          errorCode = ErrorCode.RATE_LIMIT;
        } else if (statusCode >= 500) {
          errorCode = ErrorCode.NETWORK_ERROR;
        } else {
          errorCode = ErrorCode.API_ERROR;
        }

        const error = new TranslationError(
          `Poe API Error: ${statusCode} ${response.statusText} - ${errorText}`,
          errorCode
        );

        // Retry-Afterヘッダーを保存
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          (error as any).retryAfter = parseInt(retryAfter, 10);
        }

        throw error;
      }

      return (await response.json()) as PoeApiResponse;
    } catch (error) {
      // すでにTranslationErrorの場合はそのまま再スロー
      if (error instanceof TranslationError) {
        throw error;
      }

      // ネットワークエラーなど
      throw new TranslationError(
        'Network error during API call',
        ErrorCode.NETWORK_ERROR,
        error as Error
      );
    }
  }

  private extractTranslation(response: PoeApiResponse): string {
    if (
      !response.choices ||
      !response.choices[0] ||
      !response.choices[0].message ||
      !response.choices[0].message.content
    ) {
      throw new TranslationError(
        'Invalid API response format',
        ErrorCode.API_ERROR
      );
    }

    return response.choices[0].message.content.trim();
  }

  private shouldNotRetry(error: TranslationError): boolean {
    // 認証エラー、レート制限、無効な入力、API形式エラーはリトライしない
    return [
      ErrorCode.AUTH_ERROR,
      ErrorCode.RATE_LIMIT,
      ErrorCode.INVALID_INPUT,
      ErrorCode.API_ERROR,
    ].includes(error.code);
  }

  private calculateBackoff(attempt: number): number {
    // 指数バックオフ + ジッター
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
