import { ErrorCode } from '../types';

export class TranslationError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}
