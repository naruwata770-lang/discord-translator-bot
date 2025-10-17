import { EmbedBuilder, Message, TextChannel } from 'discord.js';
import { TranslationResult } from '../types';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import logger from '../utils/logger';

export class MessageDispatcher {
  async sendTranslation(
    result: TranslationResult,
    originalMessage: Message
  ): Promise<void> {
    const embed = this.buildEmbed(result, originalMessage);

    try {
      await originalMessage.reply({
        embeds: [embed as any],
        allowedMentions: { parse: [] }, // メンション保護（@everyoneなどを無効化）
      });
    } catch (error) {
      logger.error('Failed to send translation', { error });
      throw error;
    }
  }

  async sendError(channel: TextChannel, error: Error): Promise<void> {
    const errorMessage = this.formatError(error);
    await channel.send(errorMessage);
  }

  async sendCommandResponse(
    channel: TextChannel,
    message: string
  ): Promise<void> {
    await channel.send(message);
  }

  private buildEmbed(
    result: TranslationResult,
    originalMessage: Message
  ): EmbedBuilder {
    const flag = result.sourceLang === 'ja' ? '🇯🇵→🇨🇳' : '🇨🇳→🇯🇵';

    return new EmbedBuilder()
      .setColor(0x5865f2) // Discordブルー
      .setAuthor({
        name: originalMessage.author.username,
        iconURL: originalMessage.author.displayAvatarURL(),
      })
      .setDescription(result.translatedText)
      .setFooter({
        text: `${flag} 自動翻訳`,
      })
      .setTimestamp(originalMessage.createdAt); // 原文の投稿時刻を使用
  }

  private formatError(error: Error): string {
    // エラーコードに応じて安全なメッセージを返す
    if (error instanceof TranslationError) {
      switch (error.code) {
        case ErrorCode.NETWORK_ERROR:
          return '⚠️ ネットワークエラーが発生しました。しばらくしてから再度お試しください。';
        case ErrorCode.RATE_LIMIT:
          return '⚠️ リクエストが多すぎます。少し待ってから再度お試しください。';
        case ErrorCode.AUTH_ERROR:
          return '⚠️ 認証エラーが発生しました。管理者にお問い合わせください。';
        case ErrorCode.API_ERROR:
          return '⚠️ 翻訳サービスでエラーが発生しました。しばらくしてから再度お試しください。';
        case ErrorCode.INVALID_INPUT:
          return '⚠️ 入力が正しくありません。テキストを確認してください。';
        default:
          return '⚠️ 翻訳に失敗しました。しばらくしてから再度お試しください。';
      }
    }

    // 一般的なエラーの場合は汎用メッセージ
    return '⚠️ 翻訳に失敗しました。しばらくしてから再度お試しください。';
  }
}
