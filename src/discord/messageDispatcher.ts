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

    // Embedを構築（Description統合型、4096文字制限は内部で処理）
    const embed = this.buildMultiEmbed(results, originalMessage, originalText);

    // Embedを送信
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

  /**
   * 2言語翻訳結果から単一のEmbedを構築（Description統合型）
   *
   * Phase 2実装: FieldをすべてDescriptionに統合することで、
   * モバイルでのCJKテキスト表示問題を根本的に解決
   */
  private buildMultiEmbed(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): EmbedBuilder {
    // サーバープロフィールを優先、DMの場合はグローバルプロフィールにフォールバック
    const displayName = originalMessage.member?.displayName ?? originalMessage.author.username;
    const avatarURL = originalMessage.member?.displayAvatarURL() ?? originalMessage.author.displayAvatarURL();

    // メンション再通知を防ぐため、cleanContentを使用
    const cleanText = originalMessage.cleanContent || originalText;

    // ソース言語を取得
    const sourceLang = results[0]?.sourceLang || 'unknown';

    // Descriptionに原文と翻訳結果を統合
    const maxLength = 4096;
    let description = '';
    let truncated = false;

    // 原文セクション
    const originalWithBreaks = this.addWordBreakOpportunities(cleanText, sourceLang);
    const originalSection = `💬 **原文**\n${originalWithBreaks}\n\n`;
    description += originalSection;

    // 翻訳結果セクション（各言語ごと）
    for (const result of results) {
      let section = '';

      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);

        // メンションサニタイズを適用
        const sanitizedText = this.sanitizeMentions(result.translatedText);
        // CJKテキストにゼロ幅スペース挿入
        const translatedWithBreaks = this.addWordBreakOpportunities(sanitizedText, result.targetLang);

        section = `${flag} **${langName}**\n${translatedWithBreaks}\n\n`;
      } else {
        // エラーの場合
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);
        section = `${flag} **${langName}**\n⚠️ 翻訳に失敗しました\n\n`;
      }

      // 4096文字制限チェック（警告メッセージ分の余裕を確保）
      if (description.length + section.length > maxLength - 100) {
        truncated = true;
        break;
      }

      description += section;
    }

    // 切り詰めが発生した場合は警告メッセージを追加
    if (truncated) {
      description += '\n⚠️ テキストが長すぎるため、一部の翻訳が省略されました';
    }

    // Embedを構築（FieldなしのDescription統合型）
    const sourceFlag = this.getLanguageFlag(sourceLang);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: displayName,
        iconURL: avatarURL,
      })
      .setDescription(description.trim())
      .setFooter({
        text: `${sourceFlag} 自動翻訳`,
      })
      .setTimestamp(originalMessage.createdAt);

    return embed;
  }


  /**
   * メンション記法をサニタイズして通知を防ぐ
   */
  private sanitizeMentions(text: string): string {
    return text
      .replace(/@everyone/g, '@\u200Beveryone')  // ゼロ幅スペースを挿入
      .replace(/@here/g, '@\u200Bhere')
      .replace(/<@!?(\d+)>/g, '@user')  // ユーザーメンション
      .replace(/<@&(\d+)>/g, '@role');  // ロールメンション
  }



  /**
   * CJKテキスト（中国語・日本語）にゼロ幅スペースを挿入して改行機会を提供
   * 英語など他の言語はそのまま返す
   *
   * CJKテキストはスペースがないため、Discord mobileで改行されずに途切れる問題がある。
   * ゼロ幅スペース（\u200B）を適切な間隔で挿入することで、自然な改行を可能にする。
   *
   * Phase 2実装: Description内でのレンダリングにより、ゼロ幅スペースが改行機会として認識される。
   *
   * @param text テキスト
   * @param lang 言語コード
   * @returns 改行機会が追加されたテキスト
   */
  private addWordBreakOpportunities(text: string, lang: string): string {
    // 中国語・日本語の場合のみ処理
    if (lang !== 'zh' && lang !== 'ja') {
      return text;
    }

    // 10文字ごとにゼロ幅スペースを挿入
    // iPhone 15 Pro MAX (430px画面幅) で約14.2文字/行
    // 安全マージン（±3文字）を考慮して10文字間隔を採用
    // これにより全てのモバイルデバイスで確実に改行される
    const interval = 10;
    const regex = new RegExp(`(.{${interval}})`, 'g');
    return text.replace(regex, '$1\u200B');
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
