import { CommandParser } from './commandParser';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('!auto on コマンド', () => {
    it('!auto on を正しくパースする', () => {
      const result = parser.parse('!auto on');
      expect(result).toEqual({ type: 'auto_on' });
    });

    it('大文字小文字を区別しない', () => {
      expect(parser.parse('!AUTO ON')).toEqual({ type: 'auto_on' });
      expect(parser.parse('!Auto On')).toEqual({ type: 'auto_on' });
    });

    it('前後の空白を無視する', () => {
      expect(parser.parse('  !auto on  ')).toEqual({ type: 'auto_on' });
    });

    it('複数の空白を許容する', () => {
      expect(parser.parse('!auto   on')).toEqual({ type: 'auto_on' });
    });
  });

  describe('!auto off コマンド', () => {
    it('!auto off を正しくパースする', () => {
      const result = parser.parse('!auto off');
      expect(result).toEqual({ type: 'auto_off' });
    });

    it('大文字小文字を区別しない', () => {
      expect(parser.parse('!AUTO OFF')).toEqual({ type: 'auto_off' });
    });
  });

  describe('!auto status コマンド', () => {
    it('!auto status を正しくパースする', () => {
      const result = parser.parse('!auto status');
      expect(result).toEqual({ type: 'auto_status' });
    });

    it('!auto のみでもstatusとして扱う', () => {
      const result = parser.parse('!auto');
      expect(result).toEqual({ type: 'auto_status' });
    });

    it('大文字小文字を区別しない', () => {
      expect(parser.parse('!AUTO STATUS')).toEqual({ type: 'auto_status' });
    });
  });

  describe('無効なコマンド', () => {
    it('!auto 以外のコマンドは null を返す', () => {
      expect(parser.parse('!translate こんにちは')).toBeNull();
      expect(parser.parse('!help')).toBeNull();
    });

    it('不明なサブコマンドは null を返す', () => {
      expect(parser.parse('!auto unknown')).toBeNull();
      expect(parser.parse('!auto start')).toBeNull();
    });

    it('!で始まらないメッセージは null を返す', () => {
      expect(parser.parse('auto on')).toBeNull();
      expect(parser.parse('こんにちは')).toBeNull();
    });

    it('空文字列は null を返す', () => {
      expect(parser.parse('')).toBeNull();
    });
  });
});
