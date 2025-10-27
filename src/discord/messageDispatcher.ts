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

    // メンション再通知を防ぐため、cleanContentを使用
    // cleanContentはメンションを表示名に変換する(@user → UserName)
    const cleanText = originalMessage.cleanContent || originalText;

    // ソース言語を取得（CJKテキスト改行対策とフッターで使用）
    const sourceLang = results[0]?.sourceLang || 'unknown';

    // CJKテキスト（中国語・日本語）の改行対策: ゼロ幅スペース追加
    const textWithBreaks = this.addWordBreakOpportunities(cleanText, sourceLang);

    // モバイル表示でEmbed幅を確保するため、Descriptionに最小幅を設定
    const descriptionWithWidth = this.ensureMinimumWidthForDescription(
      this.truncateField(textWithBreaks, 4096)
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: displayName,
        iconURL: avatarURL,
      })
      .setDescription(descriptionWithWidth)
      .setTimestamp(originalMessage.createdAt);

    // 成功した翻訳をフィールドとして追加
    for (const result of results) {
      if (result.status === 'success') {
        const flag = this.getLanguageFlag(result.targetLang);
        // CJKテキスト（中国語・日本語）の改行対策: ゼロ幅スペース追加→切り詰め
        const withBreaks = this.addWordBreakOpportunities(result.translatedText, result.targetLang);
        const fieldValue = this.truncateField(withBreaks, 1024);
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

    // フッター（sourceLangは上で既に取得済み）
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

        // メンション再通知を防ぐため、cleanContentを使用
        const cleanTranslation = this.sanitizeMentions(result.translatedText);
        // CJKテキスト（中国語・日本語）の改行対策: ゼロ幅スペース追加→切り詰め
        const withBreaks = this.addWordBreakOpportunities(cleanTranslation, result.targetLang);
        const descriptionWithBreaks = this.truncateField(withBreaks, 4096);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({
            name: displayName,
            iconURL: avatarURL,
          })
          .setDescription(descriptionWithBreaks)
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

    // descriptionの長さチェック（4096文字制限）
    if (data.description && data.description.length > 4096) {
      return false;
    }

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
   * Description用：モバイル表示でEmbed幅を確保するため最小幅を設定
   * Braille Pattern Blank (\u2800) を使って見えない文字で幅を確保
   *
   * Descriptionの長さがEmbed全体の幅を決定するため、
   * 必ず十分な長さを確保することでFieldsも正しく表示される
   */
  private ensureMinimumWidthForDescription(text: string): string {
    // モバイルで確実に全幅表示するため、最小40文字分のパディングを追加
    // Braille Pattern Blankは表示されないが幅を持つ
    // 4096文字制限を超えないように、残り文字数を計算
    const paddingLength = Math.min(40, 4096 - text.length - 2); // -2は改行分
    if (paddingLength > 0) {
      const padding = '\u2800'.repeat(paddingLength);
      return text + '\n' + padding;
    }
    return text;
  }

  /**
   * CJKテキスト（中国語・日本語）にゼロ幅スペースを挿入して改行機会を提供
   * 英語など他の言語はそのまま返す
   *
   * CJKテキストはスペースがないため、Discord mobileで改行されずに途切れる問題がある。
   * ゼロ幅スペース（\u200B）を適切な間隔で挿入することで、自然な改行を可能にする。
   *
   * 注意: この関数はtruncateFieldの**前**に呼び出すこと。
   * ゼロ幅スペース追加により文字数が増えるため、追加後に切り詰める必要がある。
   *
   * @param text テキスト（truncate前のもの）
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
