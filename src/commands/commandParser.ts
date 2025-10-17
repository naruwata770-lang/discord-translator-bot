import { Command } from '../types';

export class CommandParser {
  parse(content: string): Command | null {
    const trimmed = content.trim().toLowerCase();
    const parts = trimmed.split(/\s+/); // 複数スペース対応

    if (parts[0] !== '!auto') return null;

    const subcommand = parts[1] || 'status'; // デフォルトはstatus

    switch (subcommand) {
      case 'on':
        return { type: 'auto_on' };
      case 'off':
        return { type: 'auto_off' };
      case 'status':
        return { type: 'auto_status' };
      default:
        return null; // 不明なサブコマンド
    }
  }
}
