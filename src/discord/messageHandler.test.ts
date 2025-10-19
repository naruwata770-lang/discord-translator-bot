import { MessageHandler } from './messageHandler';
import { CommandParser } from '../commands/commandParser';
import { TranslationService } from '../services/translationService';
import { MessageDispatcher } from './messageDispatcher';
import { Message, TextChannel, Collection, Attachment, Embed } from 'discord.js';
import { TranslationResult } from '../types';

jest.mock('../commands/commandParser');
jest.mock('../services/translationService');
jest.mock('./messageDispatcher');

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockCommandParser: jest.Mocked<CommandParser>;
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockDispatcher: jest.Mocked<MessageDispatcher>;
  let mockMessage: jest.Mocked<Message>;
  let mockChannel: jest.Mocked<TextChannel>;

  beforeEach(() => {
    mockCommandParser = new CommandParser() as jest.Mocked<CommandParser>;
    mockTranslationService = {} as jest.Mocked<TranslationService>;
    mockDispatcher = new MessageDispatcher() as jest.Mocked<MessageDispatcher>;

    mockCommandParser.parse = jest.fn();
    mockTranslationService.translate = jest.fn();
    mockTranslationService.multiTranslate = jest.fn();
    mockDispatcher.sendMultiTranslation = jest.fn().mockResolvedValue(undefined);
    mockDispatcher.sendCommandResponse = jest.fn().mockResolvedValue(undefined);
    mockDispatcher.sendError = jest.fn().mockResolvedValue(undefined);

    const targetChannels = ['123456789'];
    handler = new MessageHandler(
      mockCommandParser,
      mockTranslationService,
      mockDispatcher,
      targetChannels
    );

    mockChannel = {
      id: '123456789',
      send: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockMessage = {
      author: {
        bot: false,
      },
      channel: mockChannel,
      channelId: '123456789',
      content: 'こんにちは',
      attachments: new Collection<string, Attachment>(),
      embeds: [],
    } as any;
  });

  describe('基本的なフィルタリング', () => {
    it('bot自身のメッセージは無視する', async () => {
      mockMessage.author.bot = true;

      await handler.handle(mockMessage);

      expect(mockTranslationService.translate).not.toHaveBeenCalled();
    });

    it('対象外のチャンネルのメッセージは無視する', async () => {
      mockMessage.channelId = '999999999';

      await handler.handle(mockMessage);

      expect(mockTranslationService.translate).not.toHaveBeenCalled();
    });

    it('対象チャンネルのメッセージは処理する', async () => {
      mockCommandParser.parse.mockReturnValue(null);
      mockTranslationService.multiTranslate.mockResolvedValue([
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
      ]);

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).toHaveBeenCalledWith('こんにちは');
    });
  });

  describe('コマンド処理', () => {
    it('!auto onコマンドで自動翻訳を有効化する', async () => {
      mockMessage.content = '!auto on';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_on' });

      await handler.handle(mockMessage);

      expect(mockDispatcher.sendCommandResponse).toHaveBeenCalledWith(
        mockChannel,
        '✅ 自動翻訳を有効にしました'
      );
    });

    it('!auto offコマンドで自動翻訳を無効化する', async () => {
      mockMessage.content = '!auto off';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_off' });

      await handler.handle(mockMessage);

      expect(mockDispatcher.sendCommandResponse).toHaveBeenCalledWith(
        mockChannel,
        '⏸️ 自動翻訳を無効にしました'
      );
    });

    it('!auto statusコマンドで現在の状態を表示する（デフォルトON）', async () => {
      mockMessage.content = '!auto status';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_status' });

      await handler.handle(mockMessage);

      expect(mockDispatcher.sendCommandResponse).toHaveBeenCalledWith(
        mockChannel,
        '現在の状態: ✅ 自動翻訳 ON'
      );
    });

    it('!auto statusコマンドで現在の状態を表示する（OFF後）', async () => {
      // 先にOFFにする
      mockMessage.content = '!auto off';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_off' });
      await handler.handle(mockMessage);

      // ステータス確認
      mockMessage.content = '!auto status';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_status' });
      await handler.handle(mockMessage);

      const calls = (mockDispatcher.sendCommandResponse as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toBe('現在の状態: ⏸️ 自動翻訳 OFF');
    });
  });

  describe('自動翻訳のスキップ判定', () => {
    beforeEach(() => {
      mockCommandParser.parse.mockReturnValue(null);
    });

    it('自動翻訳がOFFの場合はスキップする', async () => {
      // 先にOFFにする
      mockMessage.content = '!auto off';
      mockCommandParser.parse.mockReturnValue({ type: 'auto_off' });
      await handler.handle(mockMessage);

      // 通常メッセージ
      mockMessage.content = 'こんにちは';
      mockCommandParser.parse.mockReturnValue(null);
      await handler.handle(mockMessage);

      // multiTranslate は OFF後に呼ばれない（OFFコマンド時も呼ばれない）
      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('空メッセージはスキップする', async () => {
      mockMessage.content = '';

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('1文字のメッセージはスキップする', async () => {
      mockMessage.content = 'a';

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('URLのみのメッセージはスキップする', async () => {
      mockMessage.content = 'https://example.com';

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('絵文字のみのメッセージはスキップする', async () => {
      mockMessage.content = '😀😃😄';

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('コマンド(!で始まる)はスキップする', async () => {
      mockMessage.content = '!unknown command';

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('添付ファイルのみ(テキストなし)はスキップする', async () => {
      mockMessage.content = '';
      mockMessage.attachments = new Collection([
        ['1', { url: 'https://example.com/image.png' } as Attachment],
      ]);

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });

    it('Embedのみ(テキストなし)はスキップする', async () => {
      mockMessage.content = '';
      mockMessage.embeds = [{ title: 'Test Embed' } as Embed];

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).not.toHaveBeenCalled();
    });
  });

  describe('自動翻訳の実行', () => {
    beforeEach(() => {
      mockCommandParser.parse.mockReturnValue(null);
    });

    it('通常のメッセージを翻訳して送信する', async () => {
      const multiTranslationResults = [
        {
          status: 'success' as const,
          translatedText: '你好',
          sourceLang: 'ja',
          targetLang: 'zh',
        },
        {
          status: 'success' as const,
          translatedText: 'Hello',
          sourceLang: 'ja',
          targetLang: 'en',
        },
      ];
      mockTranslationService.multiTranslate.mockResolvedValue(multiTranslationResults);

      await handler.handle(mockMessage);

      expect(mockTranslationService.multiTranslate).toHaveBeenCalledWith('こんにちは');
      expect(mockDispatcher.sendMultiTranslation).toHaveBeenCalledWith(
        multiTranslationResults,
        mockMessage,
        'こんにちは'
      );
    });

    it('翻訳エラーが発生した場合はエラーメッセージを送信する', async () => {
      const error = new Error('Translation failed');
      mockTranslationService.multiTranslate.mockRejectedValue(error);

      await handler.handle(mockMessage);

      expect(mockDispatcher.sendError).toHaveBeenCalledWith(mockChannel, error);
    });
  });
});
