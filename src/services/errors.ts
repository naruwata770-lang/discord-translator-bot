export class UnsupportedLanguageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLanguageError";
    // TypeScript→ES5/ES2016トランスパイル後のinstanceof問題を回避
    Object.setPrototypeOf(this, UnsupportedLanguageError.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    // TypeScript→ES5/ES2016トランスパイル後のinstanceof問題を回避
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
