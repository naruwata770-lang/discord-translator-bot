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
    let lastError: TranslationError | null = null;
    let useStrongerPrompt = false;

    // リトライループ（最大3回）
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // 前回が検証エラーの場合のみ強化プロンプトを使用
        let prompt: string;
        if (useStrongerPrompt) {
          prompt = this.buildStrongerPrompt(text, sourceLang, targetLang, dictionaryHint);
          logger.info('Using stronger prompt for validation error retry', {
            attempt: attempt + 1,
            sourceLang,
            targetLang,
          });
        } else {
          prompt = this.buildPrompt(text, sourceLang, targetLang, dictionaryHint);
        }

        const response = await this.callApi(prompt);
        return this.extractTranslation(response, text, sourceLang, targetLang);
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

        // 検証エラーの場合は次回強化プロンプトを使用
        if (lastError.code === ErrorCode.VALIDATION_ERROR) {
          useStrongerPrompt = true;
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
        } else if (lastError.code === ErrorCode.VALIDATION_ERROR) {
          // 検証エラーの場合は短い待機時間
          delay = 500;
          logger.warn(`Validation error, retrying with stronger prompt in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            errorMessage: lastError.message,
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

    let prompt = `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}.

IMPORTANT RULES:
- You MUST translate the text, do NOT return the original text as-is
- Output ONLY the translated text in ${targetLanguage}
- Do NOT add explanations, notes, or any additional text
- Do NOT echo the source text
- The output must be in ${targetLanguage}, not ${sourceLanguage}

CRITICAL - You are a TRANSLATOR, not an assistant:
- NEVER answer questions, even if the input is a question
- NEVER provide explanations, analysis, or background information
- Just translate the text literally, preserving the original meaning and tone
- If the input is a question, the output must also be a question

Examples of correct translation:
- Input: 这是真的吗？ → Output: これは本当ですか？
- Input: なぜそうなるの？ → Output: 为什么会这样？`;

    // 辞書ヒントがある場合は追加
    if (dictionaryHint && dictionaryHint.trim() !== '') {
      prompt += `\n\n${dictionaryHint}`;
    }

    prompt += `\n\nText to translate:\n${text}`;

    return prompt;
  }

  private buildStrongerPrompt(
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

    let prompt = `You are a professional translator. This is CRITICAL.

STRICT REQUIREMENTS (FAILURE TO COMPLY WILL RESULT IN ERROR):
1. You MUST translate from ${sourceLanguage} to ${targetLanguage}
2. NEVER return the original text unchanged
3. Output MUST be in ${targetLanguage} ONLY
4. Do NOT include any explanations or notes
5. Do NOT echo the source text
6. The translation MUST contain ${targetLanguage} characters

CRITICAL - You are a TRANSLATOR, not an assistant:
7. NEVER answer questions, even if the input is a question
8. NEVER provide explanations, analysis, or background information about the content
9. Just translate the text literally, preserving the original meaning and tone
10. If the input is a question, the output must also be a question

Examples of correct translation:
- Input: 这是真的吗？ → Output: これは本当ですか？
- Input: なぜそうなるの？ → Output: 为什么会这样？`;

    // 辞書ヒントがある場合は追加
    if (dictionaryHint && dictionaryHint.trim() !== '') {
      prompt += `\n\n${dictionaryHint}`;
    }

    prompt += `\n\nNow translate this ${sourceLanguage} text to ${targetLanguage}:\n${text}`;

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

  /**
   * APIレスポンスから生のコンテンツを抽出（検証なし）
   * detectLanguageで使用
   */
  private extractRawContent(response: PoeApiResponse): string {
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

  /**
   * APIレスポンスから翻訳結果を抽出し検証
   * translateで使用
   */
  private extractTranslation(
    response: PoeApiResponse,
    originalText: string,
    sourceLang: string,
    targetLang: string
  ): string {
    const result = this.extractRawContent(response);

    // 検証1: 元テキストと翻訳結果が同一の場合はエラー
    if (result === originalText) {
      logger.warn('Translation validation failed: output is identical to input', {
        sourceLang,
        targetLang,
        textLength: originalText.length,
      });
      throw new TranslationError(
        'Translation failed: output is identical to input',
        ErrorCode.VALIDATION_ERROR
      );
    }

    // 検証2: ターゲット言語の文字が含まれているか
    if (targetLang === 'ja') {
      // 日本語ならひらがな・カタカナ・漢字のいずれかが含まれるべき
      // 固有名詞（"東京"など）や短語の場合、漢字のみの訳文も許容
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(result);
      if (!hasJapanese) {
        logger.warn('Translation validation failed: output does not contain Japanese characters', {
          sourceLang,
          targetLang,
        });
        throw new TranslationError(
          'Translation failed: output does not contain Japanese characters',
          ErrorCode.VALIDATION_ERROR
        );
      }
    } else if (targetLang === 'zh') {
      // 中国語なら漢字または中国語句読点が含まれるべき
      const hasChinese = /[\u4e00-\u9faf，。！？]/.test(result);
      if (!hasChinese) {
        logger.warn('Translation validation failed: output does not contain Chinese characters', {
          sourceLang,
          targetLang,
        });
        throw new TranslationError(
          'Translation failed: output does not contain Chinese characters',
          ErrorCode.VALIDATION_ERROR
        );
      }
    }

    logger.debug('Translation validation passed', {
      sourceLang,
      targetLang,
      inputLength: originalText.length,
      outputLength: result.length,
    });

    return result;
  }

  private shouldNotRetry(error: TranslationError): boolean {
    // 認証エラー、無効な入力、API形式エラーはリトライしない
    // VALIDATION_ERRORとRATE_LIMITはリトライ可能（プロンプト変更やRetry-Afterを尊重）
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
   * AI言語検出（言語を検出するのみ、翻訳は行わない）
   * リトライロジック付き
   * @param text 検出対象のテキスト
   * @returns 'ja' | 'zh' | 'unsupported'
   * @throws {TranslationError} API呼び出しが失敗した場合
   */
  async detectLanguage(text: string): Promise<'ja' | 'zh' | 'unsupported'> {
    let lastError: TranslationError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeDetectLanguage(text);
      } catch (error) {
        // 認証エラーはリトライしない
        if (error instanceof TranslationError && this.shouldNotRetry(error)) {
          throw error;
        }

        lastError = error instanceof TranslationError
          ? error
          : new TranslationError(
              'Network error during language detection',
              ErrorCode.NETWORK_ERROR,
              error as Error
            );

        if (attempt === this.maxRetries) {
          break;
        }

        // 待機時間を決定
        let delay: number;
        if (
          error instanceof TranslationError &&
          error.code === ErrorCode.RATE_LIMIT &&
          (error as any).retryAfter
        ) {
          delay = (error as any).retryAfter * 1000;
          logger.warn(`Rate limit hit in detectLanguage, retrying after ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
          });
        } else {
          delay = this.calculateBackoff(attempt);
          logger.warn(`detectLanguage failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * AI言語検出の実際の実行（リトライなし）
   */
  private async executeDetectLanguage(text: string): Promise<'ja' | 'zh' | 'unsupported'> {
    const systemMessage = `あなたは入力テキストの言語を判定するアシスタントです。
日本語・中国語・その他の言語を判定します。`;

    const userPrompt = `以下のテキストの言語を判定してください。

ルール:
- 日本語なら "ja" を返す
- 中国語（簡体字・繁体字）なら "zh" を返す
- それ以外なら "unsupported" を返す

重要: 単語1つのみを出力してください。説明や引用は不要です。

テキスト:
"""
${text}
"""`;

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
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const statusCode = response.status;

      let errorCode: ErrorCode;
      if (statusCode === 401 || statusCode === 403) {
        errorCode = ErrorCode.AUTH_ERROR;
      } else if (statusCode === 429) {
        errorCode = ErrorCode.RATE_LIMIT;
      } else if (statusCode >= 500) {
        errorCode = ErrorCode.NETWORK_ERROR;
      } else {
        errorCode = ErrorCode.API_ERROR;
      }

      const error = new TranslationError(
        `Language detection API Error: ${statusCode} ${response.statusText} - ${errorText}`,
        errorCode
      );

      // Retry-Afterヘッダーを保存
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        (error as any).retryAfter = parseInt(retryAfter, 10);
      }

      throw error;
    }

    const data = (await response.json()) as PoeApiResponse;
    const rawContent = this.extractRawContent(data);

    logger.debug('Language detection result', {
      textSample: text.substring(0, 50),
      rawResult: rawContent,
    });

    // 結果をパース（寛容なパース：バッククォート、引用符、句読点を除去）
    return this.parseDetectedLanguage(rawContent);
  }

  /**
   * 言語検出結果をパース（寛容なパース）
   * バッククォート、引用符、句読点などを除去してja/zh/unsupportedに変換
   */
  private parseDetectedLanguage(rawContent: string): 'ja' | 'zh' | 'unsupported' {
    // 前後の空白を除去し、小文字に変換
    let cleaned = rawContent.trim().toLowerCase();

    // バッククォート、引用符、句読点を除去
    cleaned = cleaned.replace(/[`"'.\s]/g, '');

    // 'ja'または'japanese'で始まる場合は日本語
    if (cleaned === 'ja' || cleaned.startsWith('ja') || cleaned === 'japanese') {
      return 'ja';
    }

    // 'zh'または'chinese'で始まる場合は中国語
    if (cleaned === 'zh' || cleaned.startsWith('zh') || cleaned === 'chinese') {
      return 'zh';
    }

    // それ以外はunsupported
    return 'unsupported';
  }
}
