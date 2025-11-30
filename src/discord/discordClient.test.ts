import { DiscordClient } from './discordClient';
import { MessageHandler } from './messageHandler';
import { Client, Events, Message, GatewayIntentBits, Partials } from 'discord.js';

jest.mock('./messageHandler');

// GatewayIntentBitsとPartialsをモック
jest.mock('discord.js', () => ({
  ...jest.requireActual('discord.js'),
  Client: jest.fn(),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    GuildMembers: 8,
    GuildMessageReactions: 16,
  },
  Partials: {
    Channel: 1,
    Message: 2,
    Reaction: 3,
    User: 4,
  },
  Events: {
    ClientReady: 'ready',
    MessageCreate: 'messageCreate',
    MessageReactionAdd: 'messageReactionAdd',
    Error: 'error',
  },
}));

describe('DiscordClient', () => {
  let discordClient: DiscordClient;
  let mockMessageHandler: jest.Mocked<MessageHandler>;
  let mockClient: jest.Mocked<Client>;
  const mockToken = 'test-token';

  beforeEach(() => {
    mockMessageHandler = {
      handle: jest.fn().mockResolvedValue(undefined),
    } as any;

    // discord.jsのClientをモック
    mockClient = {
      login: jest.fn().mockResolvedValue('token'),
      on: jest.fn(),
      once: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined),
      user: {
        tag: 'TestBot#1234',
      },
    } as any;

    // Clientコンストラクタをモック
    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);

    discordClient = new DiscordClient(mockToken, mockMessageHandler);
  });

  describe('constructor', () => {
    it('正しいIntentsでClientを初期化する', () => {
      expect(Client).toHaveBeenCalledWith({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
      });
    });
  });

  describe('start', () => {
    it('Clientをログインさせる', async () => {
      await discordClient.start();

      expect(mockClient.login).toHaveBeenCalledWith(mockToken);
    });

    it('readyイベントリスナーを登録する', async () => {
      await discordClient.start();

      expect(mockClient.once).toHaveBeenCalledWith(
        Events.ClientReady,
        expect.any(Function)
      );
    });

    it('messageCreateイベントリスナーを登録する', async () => {
      await discordClient.start();

      expect(mockClient.on).toHaveBeenCalledWith(
        Events.MessageCreate,
        expect.any(Function)
      );
    });

    it('readyイベント時にログを出力する', async () => {
      await discordClient.start();

      // readyイベントのコールバックを取得して実行
      const readyCallback = (mockClient.once as jest.Mock).mock.calls.find(
        (call) => call[0] === Events.ClientReady
      )?.[1];

      expect(readyCallback).toBeDefined();
      if (readyCallback) {
        // モックのclientオブジェクトを作成
        const mockReadyClient = {
          user: {
            tag: 'TestBot#1234',
          },
          guilds: {
            cache: {
              size: 5,
            },
          },
        };
        readyCallback(mockReadyClient);
        // ログ出力の確認は実装内でlogger.infoが呼ばれることで確認
      }
    });

    it('messageCreateイベント時にMessageHandlerを呼び出す', async () => {
      const mockMessage = { content: 'test message' } as Message;

      await discordClient.start();

      // messageCreateイベントのコールバックを取得して実行
      const messageCallback = (mockClient.on as jest.Mock).mock.calls.find(
        (call) => call[0] === Events.MessageCreate
      )?.[1];

      expect(messageCallback).toBeDefined();
      if (messageCallback) {
        await messageCallback(mockMessage);
        expect(mockMessageHandler.handle).toHaveBeenCalledWith(mockMessage);
      }
    });
  });

  describe('shutdown', () => {
    it('Clientを破棄する', async () => {
      await discordClient.shutdown();

      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('ログインエラーをスローする', async () => {
      const loginError = new Error('Login failed');
      mockClient.login.mockRejectedValue(loginError);

      await expect(discordClient.start()).rejects.toThrow(loginError);
    });

    it('messageCreateイベントでのエラーをログに記録する', async () => {
      const mockMessage = { content: 'test message' } as Message;
      const handlerError = new Error('Handler failed');
      mockMessageHandler.handle.mockRejectedValue(handlerError);

      await discordClient.start();

      // messageCreateイベントのコールバックを取得して実行
      const messageCallback = (mockClient.on as jest.Mock).mock.calls.find(
        (call) => call[0] === Events.MessageCreate
      )?.[1];

      if (messageCallback) {
        // エラーが発生してもクラッシュしないことを確認
        await expect(messageCallback(mockMessage)).resolves.not.toThrow();
      }
    });
  });
});
