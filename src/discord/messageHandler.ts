import { Message, TextChannel } from 'discord.js';
import { CommandParser } from '../commands/commandParser';
import { TranslationService } from '../services/translationService';
import { MessageDispatcher } from './messageDispatcher';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import logger from '../utils/logger';

export class MessageHandler {
  private autoTranslateEnabled: Map<string, boolean> = new Map();

  constructor(
    private commandParser: CommandParser,
    private translationService: TranslationService,
    private dispatcher: MessageDispatcher,
    private targetChannels: string[]
  ) {
    // デフォルトで全チャンネルの自動翻訳をONに設定
    this.targetChannels.forEach((channelId) => {
      this.autoTranslateEnabled.set(channelId, true);
    });
  }

  async handle(message: Message): Promise<void> {
    // bot自身のメッセージを無視
    if (message.author.bot) {
      return;
    }

    // 対象チャンネル判定
    if (!this.isTargetChannel(message.channelId)) {
      return;
    }

    // コマンド解析（!auto on/off/status）
    const command = this.commandParser.parse(message.content);
    if (command) {
      await this.handleCommand(command, message);
      return;
    }

    // 自動翻訳が無効なチャンネルはスキップ
    if (!this.isAutoTranslateEnabled(message.channelId)) {
      return;
    }

    // 翻訳をスキップすべきメッセージかチェック
    if (this.shouldSkipTranslation(message)) {
      return;
    }

    // 自動翻訳実行
    await this.handleAutoTranslation(message);
  }

  private isTargetChannel(channelId: string): boolean {
    return this.targetChannels.includes(channelId);
  }

  private isAutoTranslateEnabled(channelId: string): boolean {
    return this.autoTranslateEnabled.get(channelId) ?? true;
  }

  private async handleCommand(
    command: { type: string },
    message: Message
  ): Promise<void> {
    const channel = message.channel as TextChannel;

    switch (command.type) {
      case 'auto_on':
        this.autoTranslateEnabled.set(message.channelId, true);
        await this.dispatcher.sendCommandResponse(
          channel,
          '✅ 自動翻訳を有効にしました'
        );
        logger.info('Auto-translate enabled', { channelId: message.channelId });
        break;

      case 'auto_off':
        this.autoTranslateEnabled.set(message.channelId, false);
        await this.dispatcher.sendCommandResponse(
          channel,
          '⏸️ 自動翻訳を無効にしました'
        );
        logger.info('Auto-translate disabled', { channelId: message.channelId });
        break;

      case 'auto_status':
        const isEnabled = this.isAutoTranslateEnabled(message.channelId);
        const status = isEnabled ? '✅ 自動翻訳 ON' : '⏸️ 自動翻訳 OFF';
        await this.dispatcher.sendCommandResponse(
          channel,
          `現在の状態: ${status}`
        );
        break;
    }
  }

  private shouldSkipTranslation(message: Message): boolean {
    const trimmed = message.content.trim();

    // 空または極端に短いメッセージ（1文字以下）
    if (trimmed.length <= 1) {
      return true;
    }

    // URLのみのメッセージ
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      return true;
    }

    // 絵文字のみ（Unicode Extended_Pictographicプロパティを使用）
    if (/^\p{Extended_Pictographic}+$/u.test(trimmed)) {
      return true;
    }

    // コマンドメッセージ（!で始まる）
    if (message.content.startsWith('!')) {
      return true;
    }

    // 添付ファイルまたはEmbedのみ（テキストなし）
    if (
      trimmed.length === 0 &&
      (message.attachments.size > 0 || message.embeds.length > 0)
    ) {
      return true;
    }

    return false;
  }

  private async handleAutoTranslation(message: Message): Promise<void> {
    const channel = message.channel as TextChannel;

    try {
      logger.info('Starting auto-translation', {
        messageId: message.id,
        channelId: message.channelId,
        userId: message.author.id,
      });

      // 2言語同時翻訳を実行
      // TranslationService.multiTranslateが内部で言語を検出し、
      // 日本語 → 中国語 + 英語
      // 中国語 → 日本語 + 英語
      // に自動変換する
      const results = await this.translationService.multiTranslate(
        message.content
      );

      await this.dispatcher.sendMultiTranslation(
        results,
        message,
        message.content
      );

      logger.info('Multi-translation completed', {
        messageId: message.id,
        sourceLang: results[0]?.sourceLang,
        targetCount: results.filter((r) => r.status === 'success').length,
      });
    } catch (error) {
      // INVALID_INPUTエラー（英語など翻訳対象外の言語）の場合は静かにスキップ
      if (
        error instanceof TranslationError &&
        error.code === ErrorCode.INVALID_INPUT
      ) {
        logger.debug('Translation skipped (unsupported language)', {
          messageId: message.id,
        });
        return;
      }

      logger.error('Translation failed', {
        messageId: message.id,
        error,
      });

      await this.dispatcher.sendError(channel, error as Error);
    }
  }
}
