import { UnsupportedLanguageError, ValidationError } from './errors';

describe('Custom Error Classes', () => {
  describe('UnsupportedLanguageError', () => {
    it('should work with instanceof', () => {
      const error = new UnsupportedLanguageError("test");
      expect(error instanceof UnsupportedLanguageError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe("UnsupportedLanguageError");
    });

    it('should preserve error message', () => {
      const message = "Language not supported";
      const error = new UnsupportedLanguageError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('ValidationError', () => {
    it('should work with instanceof', () => {
      const error = new ValidationError("test");
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe("ValidationError");
    });

    it('should preserve error message', () => {
      const message = "Validation failed";
      const error = new ValidationError(message);
      expect(error.message).toBe(message);
    });
  });
});
