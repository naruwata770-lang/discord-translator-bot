import { MessageDispatcher } from './messageDispatcher';
import { MultiTranslationResult } from '../types/multiTranslation';
import { ErrorCode } from '../types';
import { TranslationError } from '../utils/errors';
import { Message, MessageMentionOptions } from 'discord.js';

// reply()/send()に渡されるオプション
type SendOptions = {
  content: string;
  embeds?: unknown;
  allowedMentions?: MessageMentionOptions;
};

// テストで使うチャンネルのモック
type MockChannel = {
  send: jest.Mock<Promise<Message>, [string | SendOptions]>;
};

// テストで使うメッセージのモック（Messageのうち参照するプロパティのみ）
type MockMessage = {
  author: {
    username: string;
    displayAvatarURL: jest.Mock<string, []>;
  };
  createdAt: Date;
  reply: jest.Mock<Promise<unknown>, [SendOptions]>;
  content?: string;
  cleanContent: string;
  channel?: MockChannel;
};

/**
 * モックをMessageとして渡す（必要なプロパティのみ実装しているため）
 */
function asMessage(mock: MockMessage): Message {
  return mock as unknown as Message;
}

describe('MessageDispatcher', () => {
  let dispatcher: MessageDispatcher;
  let mockMessage: MockMessage;
  let mockChannel: MockChannel;

  beforeEach(() => {
    dispatcher = new MessageDispatcher();

    // 返信メッセージのモック（react機能付き）
    const mockSentMessage = {
      id: 'sent-message-id',
      react: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    };

    // モックメッセージ作成
    mockMessage = {
      author: {
        username: 'TestUser',
        displayAvatarURL: jest.fn<string, []>().mockReturnValue('https://avatar.url'),
      },
      createdAt: new Date('2025-10-17T12:00:00Z'),
      reply: jest.fn<Promise<unknown>, [SendOptions]>().mockResolvedValue(mockSentMessage),
      cleanContent: '',  // デフォルト値
    };

    // モックチャンネル作成
    mockChannel = {
      send: jest.fn<Promise<Message>, [string | SendOptions]>().mockResolvedValue({} as Message),
    };
  });

  describe('sendMultiTranslation', () => {
    it('日本語→中国語の翻訳結果をplain textメッセージで送信する', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessage), 'こんにちは');

      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
      const replyArgs = mockMessage.reply.mock.calls[0][0];

      // Plain textメッセージが送信されることを確認
      expect(replyArgs.content).toBeDefined();
      expect(replyArgs.embeds).toBeUndefined();

      // メッセージの内容を確認
      expect(replyArgs.content).toContain('💬 **原文**');
      expect(replyArgs.content).toContain('こんにちは');
      expect(replyArgs.content).toContain('🇨🇳 **中文**');
      expect(replyArgs.content).toContain('你好');
      expect(replyArgs.content).toContain('🇯🇵 自動翻訳');

      // メンション保護が有効になっていることを確認
      expect(replyArgs.allowedMentions).toEqual({ parse: [], repliedUser: false });
    });

    it('中国語→日本語の翻訳結果をplain textメッセージで送信する', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: 'こんにちは',
          sourceLang: 'zh',
          targetLang: 'ja',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessage), '你好');

      const replyArgs = mockMessage.reply.mock.calls[0][0];

      // Plain textメッセージが送信されることを確認
      expect(replyArgs.content).toContain('💬 **原文**');
      expect(replyArgs.content).toContain('你好');
      expect(replyArgs.content).toContain('🇯🇵 **日本語**');
      expect(replyArgs.content).toContain('こんにちは');
      expect(replyArgs.content).toContain('🇨🇳 自動翻訳');
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
        dispatcher.sendMultiTranslation(results, asMessage(mockMessage), 'こんにちは')
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

  describe('Plain textメッセージ機能', () => {
    it('メンションを含むメッセージではcleanContentを使用して再通知を防ぐ', async () => {
      const mockMessageWithMention: MockMessage = {
        ...mockMessage,
        content: 'こんにちは <@123456789>',
        cleanContent: 'こんにちは @UserName',
      };

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessageWithMention), 'こんにちは <@123456789>');

      const replyArgs = mockMessageWithMention.reply.mock.calls[0][0];

      // cleanContentが使用されていることを確認
      expect(replyArgs.content).toContain('こんにちは @UserName');
      // メンション記法が含まれていないことを確認
      expect(replyArgs.content).not.toContain('<@123456789>');
    });

    it('cleanContentが空の場合はoriginalTextにフォールバックする', async () => {
      const mockMessageNoClean: MockMessage = {
        ...mockMessage,
        cleanContent: '',
      };

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessageNoClean), 'こんにちは');

      const replyArgs = mockMessageNoClean.reply.mock.calls[0][0];

      // originalTextが使用されていることを確認
      expect(replyArgs.content).toContain('こんにちは');
    });

    it('2000文字以下のメッセージは1つのメッセージで送信される', async () => {
      const shortText = 'こんにちは';
      const mockMessageShort: MockMessage = {
        ...mockMessage,
        cleanContent: shortText,
        channel: mockChannel,
      };

      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
        {
          status: 'success',
          translatedText: 'Hello',
          sourceLang: 'ja',
          targetLang: 'en',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessageShort), shortText);

      // 1つのreplyのみが呼ばれる
      expect(mockMessageShort.reply).toHaveBeenCalledTimes(1);
      // channel.sendは呼ばれない（分割なし）
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('翻訳結果のメンションがサニタイズされる', async () => {
      const results: MultiTranslationResult[] = [
        {
          status: 'success',
          translatedText: 'Hello <@123456789> and @everyone',
          sourceLang: 'ja',
          targetLang: 'en',
        },
      ];

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessage), 'こんにちは');

      const replyArgs = mockMessage.reply.mock.calls[0][0];

      // メンションがサニタイズされていることを確認
      expect(replyArgs.content).toContain('@user');
      expect(replyArgs.content).toContain('@\u200Beveryone');
      expect(replyArgs.content).not.toContain('<@123456789>');
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

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessage), 'Hello');

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

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessage), 'こんにちは');

      // メッセージが送信されることを確認
      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
    });

    it('全ての結果がINVALID_INPUT以外のエラーの場合はエラーメッセージを送信する', async () => {
      // channelプロパティを持つモックメッセージを作成
      const mockMessageWithChannel: MockMessage = {
        ...mockMessage,
        channel: mockChannel,
      };

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

      await dispatcher.sendMultiTranslation(results, asMessage(mockMessageWithChannel), 'こんにちは');

      // エラーメッセージが送信されることを確認
      expect(mockChannel.send).toHaveBeenCalledWith(
        '⚠️ 翻訳サービスでエラーが発生しました。しばらくしてから再度お試しください。'
      );
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

});

