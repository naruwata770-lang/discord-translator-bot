import { Message, MessageMentionOptions } from 'discord.js';
import { TranslationError } from '../utils/errors';
import { ErrorCode } from '../types';
import { MultiTranslationResult } from '../types/multiTranslation';
import logger from '../utils/logger';

// send()メソッドを持つチャンネルの型
export type ChannelWithSend = {
  send(content: string): Promise<Message>;
  send(options: {
    content: string;
    allowedMentions?: MessageMentionOptions;
  }): Promise<Message>;
};

export class MessageDispatcher {
  async sendError(channel: ChannelWithSend, error: Error): Promise<void> {
    const errorMessage = this.formatError(error);
    await channel.send(errorMessage);
  }

  async sendCommandResponse(
    channel: ChannelWithSend,
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
          originalMessage.channel as ChannelWithSend,
          errorObj
        );
      }
      return;
    }

    // 通常テキストメッセージを構築
    const message = this.buildPlainTextMessage(results, originalMessage, originalText);

    // 2000文字チェック
    if (message.length <= 2000) {
      // 1メッセージで送信
      try {
        await originalMessage.reply({
          content: message,
          allowedMentions: { parse: [], repliedUser: false },
        });
      } catch (error) {
        logger.error('Failed to send multi-translation', {
          messageId: originalMessage.id,
          messageLength: message.length,
          resultsCount: results.length,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
        });
        throw error;
      }
    } else {
      // 複数メッセージに分割（稀なケース）
      try {
        await this.sendSplitMessages(results, originalMessage, originalText);
      } catch (error) {
        logger.error('Failed to send split messages', {
          messageId: originalMessage.id,
          resultsCount: results.length,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
        });
        throw error;
      }
    }
  }

  /**
   * 2言語翻訳結果から通常テキストメッセージを構築
   *
   * Phase 3実装: Embed形式を廃止し、通常テキストメッセージを使用することで、
   * Discord iOSが自動的にCJKテキストを折り返すようにする
   */
  private buildPlainTextMessage(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): string {
    // メンション再通知を防ぐため、cleanContentを使用
    const cleanText = originalMessage.cleanContent || originalText;

    // ソース言語を取得
    const sourceLang = results[0]?.sourceLang || 'unknown';

    // 原文セクション
    let message = `💬 **原文**\n${cleanText}\n\n`;

    // 翻訳結果セクション（各言語ごと）
    for (const result of results) {
      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);
        const sanitizedText = this.sanitizeMentions(result.translatedText);

        message += `${flag} **${langName}**\n${sanitizedText}\n\n`;
      } else {
        // エラーの場合
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);
        message += `${flag} **${langName}**\n⚠️ 翻訳に失敗しました\n\n`;
      }
    }

    // フッター
    const sourceFlag = this.getLanguageFlag(sourceLang);
    message += `${sourceFlag} 自動翻訳`;

    return message;
  }

  /**
   * 2000文字を超える場合に複数メッセージに分割して送信
   */
  private async sendSplitMessages(
    results: MultiTranslationResult[],
    originalMessage: Message,
    originalText: string
  ): Promise<void> {
    const sourceLang = results[0]?.sourceLang || 'unknown';
    const cleanText = originalMessage.cleanContent || originalText;
    const sourceFlag = this.getLanguageFlag(sourceLang);

    const channel = originalMessage.channel as ChannelWithSend;

    // 原文を送信
    const originalMsg = `💬 **原文**\n${cleanText}\n\n${sourceFlag} 自動翻訳`;

    if (originalMsg.length <= 2000) {
      await originalMessage.reply({
        content: originalMsg,
        allowedMentions: { parse: [], repliedUser: false },
      });
    } else {
      // 原文自体が2000文字超過（極めて稀）
      const chunks = this.splitText(cleanText, 1900);
      for (let i = 0; i < chunks.length; i++) {
        const content = i === 0
          ? `💬 **原文**\n${chunks[i]}`
          : `💬 **原文（続き）**\n${chunks[i]}`;

        if (i === 0) {
          await originalMessage.reply({
            content,
            allowedMentions: { parse: [], repliedUser: false },
          });
        } else {
          await channel.send(content);
        }
      }
    }

    // 各翻訳結果を送信
    for (const result of results) {
      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);
        const sanitizedText = this.sanitizeMentions(result.translatedText);

        const translationMsg = `${flag} **${langName}**\n${sanitizedText}`;

        if (translationMsg.length <= 2000) {
          await channel.send(translationMsg);
        } else {
          // 翻訳結果が2000文字超過
          const chunks = this.splitText(sanitizedText, 1900);
          for (let i = 0; i < chunks.length; i++) {
            const content = i === 0
              ? `${flag} **${langName}**\n${chunks[i]}`
              : `${flag} **${langName}（続き）**\n${chunks[i]}`;
            await channel.send(content);
          }
        }
      } else {
        // エラーの場合
        const flag = this.getLanguageFlag(result.targetLang);
        const langName = this.getLanguageName(result.targetLang);
        await channel.send(`${flag} **${langName}**\n⚠️ 翻訳に失敗しました`);
      }
    }
  }

  /**
   * テキストを指定文字数で分割（改行を考慮）
   */
  private splitText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);

        // 1行が長すぎる場合は強制分割
        if (line.length > maxLength) {
          let remaining = line;
          while (remaining.length > maxLength) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
          currentChunk = remaining;
        } else {
          currentChunk = line;
        }
      }
    }

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
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
        case ErrorCode.VALIDATION_ERROR:
          return '⚠️ AIが元のテキストをそのまま返しました。別の表現で試してください。';
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
