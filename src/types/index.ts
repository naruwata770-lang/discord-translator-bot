export interface TranslationRequest {
  text: string;
  sourceLang?: string;
  targetLang?: string;
}

export interface TranslationResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

export type MultiTranslationResult =
  | {
      status: 'success';
      translatedText: string;
      sourceLang: string;
      targetLang: string;
    }
  | {
      status: 'error';
      errorCode: ErrorCode;
      errorMessage: string;
      sourceLang: string;
      targetLang: string;
    };

export interface Command {
  type: 'auto_on' | 'auto_off' | 'auto_status';
}

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_ERROR = 'AUTH_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNKNOWN = 'UNKNOWN',
}
