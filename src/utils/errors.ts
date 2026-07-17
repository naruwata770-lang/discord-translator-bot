import { ErrorCode } from '../types';

export class TranslationError extends Error {
  /** 429レスポンスのRetry-Afterヘッダー値（秒） */
  retryAfter?: number;

  constructor(
    message: string,
    public code: ErrorCode,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}
