import { MessageDispatcher } from './messageDispatcher';
import { MultiTranslationResult } from '../types/multiTranslation';
import { ErrorCode } from '../types';
import { TranslationError } from '../utils/errors';
import { Message, EmbedBuilder, TextChannel } from 'discord.js';

describe('MessageDispatcher', () => {
  let dispatcher: MessageDispatcher;
  let mockMessage: jest.Mocked<Message>;
  let mockChannel: jest.Mocked<TextChannel>;

  beforeEach(() => {
    dispatcher = new MessageDispatcher();

    // モックメッセージ作成
    mockMessage = {
      author: {
        username: 'TestUser',
        displayAvatarURL: jest.fn().mockReturnValue('https://avatar.url'),
      },
      createdAt: new Date('2025-10-17T12:00:00Z'),
      reply: jest.fn().mockResolvedValue(undefined),
      cleanContent: '',  // デフォルト値
    } as any;

    // モックチャンネル作成
    mockChannel = {
      send: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe('sendMultiTranslation', () => {
    it('日本語→中国語の翻訳結果をEmbed形式で送信する', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessage, 'こんにちは');

      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
      const replyArgs = (mockMessage.reply as jest.Mock).mock.calls[0][0];

      // Embedが含まれていることを確認
      expect(replyArgs.embeds).toHaveLength(1);
      const embed = replyArgs.embeds[0];

      // Embedの内容を確認
      expect(embed.data.author.name).toBe('TestUser');
      expect(embed.data.author.icon_url).toBe('https://avatar.url');
      expect(embed.data.description).toBe('こんにちは');
      expect(embed.data.footer.text).toContain('自動翻訳');
      expect(embed.data.timestamp).toBe('2025-10-17T12:00:00.000Z');

      // メンション保護が有効になっていることを確認
      expect(replyArgs.allowedMentions).toEqual({ parse: [], repliedUser: false });
    });

    it('サーバー内のメッセージではサーバープロフィールのアイコンとニックネームを使用する', async () => {
      const mockGuildMessage = {
        ...mockMessage,
        member: {
          displayName: 'ServerNickname',
          displayAvatarURL: jest.fn().mockReturnValue('https://server-avatar.url'),
        },
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockGuildMessage, 'こんにちは');

      const replyArgs = (mockGuildMessage.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // サーバープロフィールのアイコンとニックネームが使用されていることを確認
      expect(embed.data.author.name).toBe('ServerNickname');
      expect(embed.data.author.icon_url).toBe('https://server-avatar.url');
    });

    it('DMではグローバルプロフィールのアイコンとユーザー名を使用する（フォールバック）', async () => {
      const mockDMMessage = {
        ...mockMessage,
        member: null, // DMではmemberがnull
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockDMMessage, 'こんにちは');

      const replyArgs = (mockDMMessage.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // グローバルプロフィールにフォールバックすることを確認
      expect(embed.data.author.name).toBe('TestUser');
      expect(embed.data.author.icon_url).toBe('https://avatar.url');
    });

    it('中国語→日本語の翻訳結果をEmbed形式で送信する', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: 'こんにちは',
          sourceLang: 'zh',
          targetLang: 'ja',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessage, '你好');

      const replyArgs = (mockMessage.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      expect(embed.data.footer.text).toContain('自動翻訳');
    });

    it('送信に失敗した場合はエラーを投げる', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      const sendError = new Error('Send failed');
      mockMessage.reply.mockRejectedValue(sendError);

      await expect(
        dispatcher.sendMultiTranslation(results, mockMessage, 'こんにちは')
      ).rejects.toThrow(sendError);
    });
  });

  describe('sendError', () => {
    it('NETWORK_ERRORの場合は適切なメッセージを送信する', async () => {
      const error = new TranslationError(
        'Network error',
        ErrorCode.NETWORK_ERROR
      );

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ ネットワークエラーが発生しました。しばらくしてから再度お試しください。'
      );
    });

    it('RATE_LIMITの場合は適切なメッセージを送信する', async () => {
      const error = new TranslationError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT
      );

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ リクエストが多すぎます。少し待ってから再度お試しください。'
      );
    });

    it('AUTH_ERRORの場合は適切なメッセージを送信する', async () => {
      const error = new TranslationError(
        'Authentication failed',
        ErrorCode.AUTH_ERROR
      );

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 認証エラーが発生しました。管理者にお問い合わせください。'
      );
    });

    it('API_ERRORの場合は適切なメッセージを送信する', async () => {
      const error = new TranslationError('API error', ErrorCode.API_ERROR);

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 翻訳サービスでエラーが発生しました。しばらくしてから再度お試しください。'
      );
    });

    it('INVALID_INPUTの場合は適切なメッセージを送信する', async () => {
      const error = new TranslationError(
        'Invalid input',
        ErrorCode.INVALID_INPUT
      );

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 入力が正しくありません。テキストを確認してください。'
      );
    });

    it('一般的なエラーの場合は汎用メッセージを送信する', async () => {
      const error = new Error('Generic error');

      await dispatcher.sendError(mockChannel, error);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 翻訳に失敗しました。しばらくしてから再度お試しください。'
      );
    });
  });

  describe('sendCommandResponse', () => {
    it('コマンド応答メッセージを送信する', async () => {
      await dispatcher.sendCommandResponse(mockChannel, '✅ 自動翻訳を有効にしました');

      expect(mockChannel.send).toHaveBeenCalledWith('✅ 自動翻訳を有効にしました');
    });
  });

  describe('モバイル表示対応', () => {
    it('元のメッセージがdescriptionに含まれることでEmbed幅が確保される', async () => {
      const mockMessageWithClean = {
        ...mockMessage,
        cleanContent: 'こんにちは',
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageWithClean, 'こんにちは');

      const replyArgs = (mockMessageWithClean.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // descriptionに元のメッセージが設定されていることを確認
      expect(embed.data.description).toBe('こんにちは');
    });

    it('メンションを含むメッセージではcleanContentを使用して再通知を防ぐ', async () => {
      const mockMessageWithMention = {
        ...mockMessage,
        content: 'こんにちは <@123456789>',
        cleanContent: 'こんにちは @UserName',
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageWithMention, 'こんにちは <@123456789>');

      const replyArgs = (mockMessageWithMention.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // descriptionにcleanContentが使用されていることを確認
      expect(embed.data.description).toBe('こんにちは @UserName');
      // メンション記法が含まれていないことを確認
      expect(embed.data.description).not.toContain('<@');
    });

    it('長いメッセージはdescriptionで4096文字に切り詰められる', async () => {
      const longText = 'あ'.repeat(5000);
      const mockMessageWithLongText = {
        ...mockMessage,
        cleanContent: longText,
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageWithLongText, longText);

      const replyArgs = (mockMessageWithLongText.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // descriptionが4096文字以下に切り詰められていることを確認
      expect(embed.data.description.length).toBeLessThanOrEqual(4096);
      expect(embed.data.description).toContain('...');
    });

    it('フィールド値が1024文字を超える場合は切り詰められる', async () => {
      const mockMessageForField = {
        ...mockMessage,
        cleanContent: 'こんにちは',
      } as any;

      const longTranslation = 'a'.repeat(2000);
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: longTranslation,
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageForField, 'こんにちは');

      const replyArgs = (mockMessageForField.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // フィールド値が1024文字以下に切り詰められていることを確認
      const field = embed.data.fields[0];
      expect(field.value.length).toBeLessThanOrEqual(1024);
      expect(field.value).toContain('...');
    });

    it('cleanContentが空の場合はoriginalTextにフォールバックする', async () => {
      const mockMessageNoClean = {
        ...mockMessage,
        cleanContent: '',
      } as any;

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageNoClean, 'こんにちは');

      const replyArgs = (mockMessageNoClean.reply as jest.Mock).mock.calls[0][0];
      const embed = replyArgs.embeds[0];

      // originalTextが使用されていることを確認
      expect(embed.data.description).toBe('こんにちは');
    });
  });

  describe('sendMultiTranslation', () => {
    it('全ての結果がINVALID_INPUTエラーの場合は静かにスキップする', async () => {
      const results = [
        {
          status: 'error' as const,
          sourceLang: 'unknown',
          targetLang: 'zh',
          errorCode: ErrorCode.INVALID_INPUT,
          errorMessage: 'Language could not be detected',
        },
        {
          status: 'error' as const,
          sourceLang: 'unknown',
          targetLang: 'en',
          errorCode: ErrorCode.INVALID_INPUT,
          errorMessage: 'Language could not be detected',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessage, 'Hello');

      // メッセージが送信されないことを確認
      expect(mockMessage.reply).not.toHaveBeenCalled();
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('一部の翻訳がINVALID_INPUTエラーでも成功結果があればEmbedを送信する', async () => {
      const results = [
        {
          status: 'success' as const,
          sourceLang: 'ja',
          targetLang: 'zh',
          translatedText: '你好',
        },
        {
          status: 'error' as const,
          sourceLang: 'ja',
          targetLang: 'en',
          errorCode: ErrorCode.INVALID_INPUT,
          errorMessage: 'Translation failed',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessage, 'こんにちは');

      // メッセージが送信されることを確認
      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
    });

    it('全ての結果がINVALID_INPUT以外のエラーの場合はエラーメッセージを送信する', async () => {
      // channelプロパティを持つモックメッセージを作成
      const mockMessageWithChannel = {
        ...mockMessage,
        channel: mockChannel,
      } as any;

      const results = [
        {
          status: 'error' as const,
          sourceLang: 'ja',
          targetLang: 'zh',
          errorCode: ErrorCode.API_ERROR,
          errorMessage: 'API service unavailable',
        },
        {
          status: 'error' as const,
          sourceLang: 'ja',
          targetLang: 'en',
          errorCode: ErrorCode.API_ERROR,
          errorMessage: 'API service unavailable',
        },
      ];

      await dispatcher.sendMultiTranslation(results, mockMessageWithChannel, 'こんにちは');

      // エラーメッセージが送信されることを確認
      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 翻訳サービスでエラーが発生しました。しばらくしてから再度お試しください。'
      );
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });
});
