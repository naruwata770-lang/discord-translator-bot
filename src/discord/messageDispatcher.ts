import { EmbedBuilder, Message, TextChannel } from 'discord.js';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import { MultiTranslationResult } from '../types/multiTranslation';
import logger from '../utils/logger';

export class MessageDispatcher {
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

  /**
   * 2言語同時翻訳結果を送信
   * @param results 翻訳結果の配列（成功/失敗を含む）
   * @param originalMessage 元のDiscordメッセージ
   */
  async sendMultiTranslation(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): Promise<void> {
    // 少なくとも1つは成功している必要がある
    const hasSuccess = results.some((r) => r.status === 'success');
    if (!hasSuccess) {
      // 全て失敗の場合
      const firstError = results.find((r) => r.status === 'error');
      if (firstError && firstError.status === 'error') {
        // INVALID_INPUT（英語など翻訳対象外の言語）の場合は静かにスキップ
        if (firstError.errorCode === ErrorCode.INVALID_INPUT) {
          logger.debug('Translation skipped (unsupported language)', {
            messageId: originalMessage.id,
            errorCode: firstError.errorCode,
          });
          return;
        }

        // その他のエラーはユーザーに通知
        const errorObj = new TranslationError(
          firstError.errorMessage,
          firstError.errorCode
        );
        await this.sendError(
          originalMessage.channel as TextChannel,
          errorObj
        );
      }
      return;
    }

    // Embedを構築
    const embed = this.buildMultiEmbed(results, originalMessage, originalText);

    // Embedサイズチェック
    if (!this.isEmbedValid(embed)) {
      // サイズオーバーの場合は複数Embedに分割
      const embeds = this.buildMultipleEmbeds(
        results,
        originalMessage,
        originalText
      );
      try {
        await originalMessage.reply({
          embeds: embeds as any[],
          allowedMentions: { parse: [], repliedUser: false },
        });
      } catch (error) {
        logger.error('Failed to send multi-translation (fallback)', { error });
        throw error;
      }
    } else {
      // 通常送信
      try {
        await originalMessage.reply({
          embeds: [embed as any],
          allowedMentions: { parse: [], repliedUser: false },
        });
      } catch (error) {
        logger.error('Failed to send multi-translation', { error });
        throw error;
      }
    }
  }

  /**
   * 2言語翻訳結果から単一のEmbedを構築
   */
  private buildMultiEmbed(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): EmbedBuilder {
    // サーバープロフィールを優先、DMの場合はグローバルプロフィールにフォールバック
    const displayName = originalMessage.member?.displayName ?? originalMessage.author.username;
    const avatarURL = originalMessage.member?.displayAvatarURL() ?? originalMessage.author.displayAvatarURL();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: displayName,
        iconURL: avatarURL,
      })
      .setTimestamp(originalMessage.createdAt);

    // 成功した翻訳をフィールドとして追加
    for (const result of results) {
      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        const fieldValue = this.truncateField(result.translatedText, 1024);
        embed.addFields({
          name: `${flag} ${this.getLanguageName(result.targetLang)}`,
          value: fieldValue,
          inline: false,
        });
      } else {
        // エラーの場合は簡易表示
        const flag = this.getLanguageFlag(result.targetLang);
        embed.addFields({
          name: `${flag} ${this.getLanguageName(result.targetLang)}`,
          value: '⚠️ 翻訳に失敗しました',
          inline: false,
        });
      }
    }

    // フッター
    const sourceLang = results[0]?.sourceLang || 'unknown';
    const sourceFlag = this.getLanguageFlag(sourceLang);
    embed.setFooter({
      text: `${sourceFlag} 自動翻訳`,
    });

    return embed;
  }

  /**
   * 複数Embedに分割（サイズオーバー時のフォールバック）
   */
  private buildMultipleEmbeds(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): EmbedBuilder[] {
    // サーバープロフィールを優先、DMの場合はグローバルプロフィールにフォールバック
    const displayName = originalMessage.member?.displayName ?? originalMessage.author.username;
    const avatarURL = originalMessage.member?.displayAvatarURL() ?? originalMessage.author.displayAvatarURL();

    const embeds: EmbedBuilder[] = [];

    for (const result of results) {
      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        const sourceFlag = this.getLanguageFlag(result.sourceLang);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({
            name: displayName,
            iconURL: avatarURL,
          })
          .setDescription(this.truncateField(result.translatedText, 4096))
          .setFooter({
            text: `${sourceFlag}→${flag} 自動翻訳`,
          })
          .setTimestamp(originalMessage.createdAt);

        embeds.push(embed);
      }
    }

    return embeds;
  }

  /**
   * Embedが有効かチェック（Discordの制限内か）
   */
  private isEmbedValid(embed: EmbedBuilder): boolean {
    const data = embed.toJSON();

    // 総文字数チェック（6000文字制限）
    let totalLength = 0;
    if (data.title) totalLength += data.title.length;
    if (data.description) totalLength += data.description.length;
    if (data.footer?.text) totalLength += data.footer.text.length;
    if (data.author?.name) totalLength += data.author.name.length;

    if (data.fields) {
      for (const field of data.fields) {
        totalLength += field.name.length + field.value.length;
        // 個別フィールドの長さチェック（1024文字制限）
        if (field.value.length > 1024) {
          return false;
        }
      }
    }

    return totalLength <= 6000;
  }

  /**
   * フィールド値を切り詰め
   */
  private truncateField(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 言語コードから国旗絵文字を取得
   */
  private getLanguageFlag(lang: string): string {
    switch (lang) {
      case 'ja':
        return '🇯🇵';
      case 'zh':
        return '🇨🇳';
      case 'en':
        return '🇺🇸';
      default:
        return '🌐';
    }
  }

  /**
   * 言語コードから言語名を取得
   */
  private getLanguageName(lang: string): string {
    switch (lang) {
      case 'ja':
        return '日本語';
      case 'zh':
        return '中文';
      case 'en':
        return 'English';
      default:
        return lang;
    }
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
