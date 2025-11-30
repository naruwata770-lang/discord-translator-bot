import { MessageReaction, User, Message, ThreadChannel } from 'discord.js';
import { TranslationService } from '../services/translationService';
import { MessageDispatcher } from './messageDispatcher';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import logger from '../utils/logger';

const RETRY_EMOJI = '🔄';
const COOLDOWN_MS = 30000; // 30秒

export class ReactionHandler {
  private retryCooldowns: Map<string, number> = new Map();
  private botUserId: string | null = null;

  constructor(
    private translationService: TranslationService,
    private dispatcher: MessageDispatcher,
    private targetChannels: string[]
  ) {}

  setBotUserId(botUserId: string): void {
    this.botUserId = botUserId;
  }

  async handle(reaction: MessageReaction, user: User): Promise<void> {
    // パーシャルの解決
    try {
      if (reaction.partial) {
        reaction = await reaction.fetch();
      }
      if (reaction.message.partial) {
        await reaction.message.fetch();
      }
    } catch (error) {
      logger.debug('Failed to fetch partial reaction/message', { error });
      return;
    }

    const message = reaction.message as Message;

    // 基本的な検証
    if (!this.botUserId) return; // まだ初期化されていない
    if (user.bot) return;
    if (reaction.emoji.name !== RETRY_EMOJI) return;
    if (!message.guild) return; // DMを除外
    if (message.author?.id !== this.botUserId) return;
    if (!message.reference?.messageId) return;

    // 対象チャンネルかチェック
    if (!this.isTargetChannel(message)) return;

    // クールダウンチェック
    const originalMessageId = message.reference.messageId;
    const lastRetry = this.retryCooldowns.get(originalMessageId);
    if (lastRetry && Date.now() - lastRetry < COOLDOWN_MS) {
      logger.debug('Retry cooldown active', { originalMessageId });
      return;
    }

    // リトライ実行
    await this.executeRetry(message, originalMessageId);
  }

  private isTargetChannel(message: Message): boolean {
    const channelId = message.channelId;

    if (this.targetChannels.includes(channelId)) {
      return true;
    }

    const channel = message.channel;
    if (channel.isThread()) {
      const parentId = (channel as ThreadChannel).parentId;
      return parentId ? this.targetChannels.includes(parentId) : false;
    }

    return false;
  }

  private async executeRetry(
    botMessage: Message,
    originalMessageId: string
  ): Promise<void> {
    try {
      // 元メッセージを取得（編集が反映される）
      const originalMessage = await botMessage.channel.messages.fetch(
        originalMessageId
      );

      if (!originalMessage.content) {
        logger.debug('Original message has no content', { originalMessageId });
        return;
      }

      // クールダウン更新
      this.retryCooldowns.set(originalMessageId, Date.now());

      logger.info('Retry translation requested', {
        originalMessageId,
        botMessageId: botMessage.id,
        channelId: botMessage.channelId,
      });

      // 再翻訳実行
      const results = await this.translationService.multiTranslate(
        originalMessage.content
      );

      await this.dispatcher.sendMultiTranslation(
        results,
        originalMessage,
        originalMessage.content
      );

      logger.info('Retry translation completed', {
        originalMessageId,
        sourceLang: results[0]?.sourceLang,
      });
    } catch (error) {
      // 翻訳対象外言語の場合は静かにスキップ
      if (
        error instanceof TranslationError &&
        error.code === ErrorCode.INVALID_INPUT
      ) {
        logger.debug('Retry skipped (unsupported language)', {
          originalMessageId,
        });
        return;
      }

      logger.error('Retry translation failed', {
        originalMessageId,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      });
    }
  }
}
