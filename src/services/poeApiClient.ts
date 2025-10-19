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
    targetLang: string,
    dictionaryHint?: string
  ): Promise<string> {
    const prompt = this.buildPrompt(text, sourceLang, targetLang, dictionaryHint);

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

        // 429エラーの場合はRetry-Afterヘッダーを尊重
        let delay: number;
        if (
          lastError.code === ErrorCode.RATE_LIMIT &&
          (lastError as any).retryAfter
        ) {
          delay = (lastError as any).retryAfter * 1000; // 秒をミリ秒に変換
          logger.warn(`Rate limit hit, retrying after ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
          });
        } else {
          // 指数バックオフで待機
          delay = this.calculateBackoff(attempt);
          logger.warn(`API call failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
          });
        }

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private buildPrompt(
    text: string,
    sourceLang: string,
    targetLang: string,
    dictionaryHint?: string
  ): string {
    const langMap: Record<string, string> = {
      ja: 'Japanese',
      zh: 'Chinese',
      en: 'English',
    };

    const sourceLanguage = langMap[sourceLang] || sourceLang;
    const targetLanguage = langMap[targetLang] || targetLang;

    let prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only output the translation, without any explanation or additional text.`;

    // 辞書ヒントがある場合は追加
    if (dictionaryHint && dictionaryHint.trim() !== '') {
      prompt += `\n\n${dictionaryHint}`;
    }

    prompt += `\n\nText: ${text}`;

    return prompt;
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
    // 認証エラー、無効な入力、API形式エラーはリトライしない
    // RATE_LIMITは除外してリトライ可能にする（Retry-Afterを尊重）
    return [
      ErrorCode.AUTH_ERROR,
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

  /**
   * AI言語検出 + 翻訳（言語を自動検出して翻訳を実行）
   * @param text 翻訳対象のテキスト
   * @param dictionaryHint 辞書から生成されたヒント（オプション）
   * @returns 翻訳結果
   * @throws {UnsupportedLanguageError} 未対応言語の場合
   * @throws {ValidationError} AI出力が不正な場合
   * @throws {TranslationError} API呼び出しが失敗した場合
   */
  async translateWithAutoDetect(text: string, dictionaryHint?: string): Promise<string> {
    const systemMessage = `You are a precise translation engine for Japanese and Chinese languages.
Your task is to detect the input language and translate accordingly.
You must follow the output format exactly.`;

    let userPrompt = `Detect the language and translate:
- Japanese → Chinese (Simplified)
- Chinese → Japanese
- Other languages → output exactly "UNSUPPORTED_LANGUAGE"

Rules:
1. Output ONLY the translation text, no explanations
2. Do not echo the source text
3. Do not add markdown, quotes, or formatting
4. For mixed-language text, translate only JP/ZH parts

Examples:

Input: こんにちは
Output: 你好

Input: 你好
Output: こんにちは

Input: Hello World
Output: UNSUPPORTED_LANGUAGE

Input: 今日はいい天気ですね
Output: 今天天気很好呢

Input: 这个东西坏了
Output: これは壊れました`;

    // 辞書ヒントがある場合は追加
    if (dictionaryHint && dictionaryHint.trim() !== '') {
      userPrompt += `\n\n${dictionaryHint}`;
    }

    userPrompt += `\n\nNow translate:\n${text}`;

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
            { role: 'system', content: systemMessage },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

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

        throw new TranslationError(
          `Poe API Error: ${statusCode} ${response.statusText} - ${errorText}`,
          errorCode
        );
      }

      const data = (await response.json()) as PoeApiResponse;
      const rawContent = this.extractTranslation(data);

      // バリデーション: 既知のフィラー文をスキップして翻訳結果を抽出
      const lines = rawContent.trim().split('\n');

      // フィラー文のパターン（英語の説明文など）
      const FILLER_PATTERNS = [
        /^(Sure|Here|Okay|Alright|OK)[,:\s]/i,
        /^(the\s+)?(Translation|Translated|Result)[:\s]/i,
        /^(The translation is|Here's the translation|is the translation|is the result)[:\s]/i,
        /^(here is|here's|this is|is the)[:\s]/i,
      ];

      // フィラー文を除去して翻訳結果を抽出
      const resultLines: string[] = [];
      let inFillerSection = true;

      for (const line of lines) {
        const trimmedLine = line.trim();

        // 空行はフィラーセクション中はスキップ、翻訳セクション中は保持
        if (trimmedLine.length === 0) {
          if (!inFillerSection) {
            resultLines.push('');
          }
          continue;
        }

        // フィラー文を繰り返し除去（同じ行に複数のフィラーパターンがある場合に対応）
        let cleanedLine = trimmedLine;
        let hadMatch = false;
        let keepChecking = true;

        while (keepChecking && cleanedLine.length > 0) {
          keepChecking = false;
          for (const pattern of FILLER_PATTERNS) {
            const match = pattern.exec(cleanedLine);
            if (match) {
              hadMatch = true;
              cleanedLine = cleanedLine.substring(match[0].length).trim();
              keepChecking = true; // 再度チェック
              break;
            }
          }
        }

        // フィラー除去後に何か残っている、または非フィラー行の場合
        if (cleanedLine.length > 0) {
          inFillerSection = false;
          resultLines.push(cleanedLine);
        } else if (hadMatch) {
          // フィラー文のみの行、フィラーセクション継続
          continue;
        } else {
          // 非フィラー行
          inFillerSection = false;
          resultLines.push(cleanedLine);
        }
      }

      // 結果を結合
      let result = resultLines.join('\n').trim();

      // UNSUPPORTED_LANGUAGEの特別処理
      if (result === 'UNSUPPORTED_LANGUAGE') {
        const { UnsupportedLanguageError } = await import('./errors');
        throw new UnsupportedLanguageError(
          'Language not supported by AI detection'
        );
      }

      // 空の結果、または英語のみの結果はバリデーションエラー
      if (!result || result.length === 0) {
        const { ValidationError } = await import('./errors');
        throw new ValidationError('AI returned empty translation');
      }

      // 結果が英語のみ（日本語・中国語の文字を含まない）の場合はバリデーションエラー
      const hasJapaneseChinese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(
        result
      );
      if (!hasJapaneseChinese) {
        const { ValidationError } = await import('./errors');
        throw new ValidationError(
          `AI returned non-Japanese/Chinese text: ${result}`
        );
      }

      return result;
    } catch (error) {
      // カスタムエラー（UnsupportedLanguageError, ValidationError）はそのまま再スロー
      if (
        error instanceof Error &&
        (error.name === 'UnsupportedLanguageError' ||
          error.name === 'ValidationError')
      ) {
        throw error;
      }

      // TranslationErrorもそのまま再スロー
      if (error instanceof TranslationError) {
        throw error;
      }

      // その他のネットワークエラーなど
      throw new TranslationError(
        'Network error during AI detection',
        ErrorCode.NETWORK_ERROR,
        error as Error
      );
    }
  }
}
