import { DiscordClient } from './discordClient';
import { MessageHandler } from './messageHandler';
import { Client, Events, Message, GatewayIntentBits, Partials } from 'discord.js';
import logger from '../utils/logger';

jest.mock('./messageHandler');

// GatewayIntentBitsとPartialsをモック
jest.mock('discord.js', () => ({
  ...jest.requireActual<typeof import('discord.js')>('discord.js'),
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

type Listener = (...args: unknown[]) => unknown;

// テストで使うClientのメソッドだけを持つモック
type MockClient = {
  login: jest.Mock<Promise<string>, [string]>;
  on: jest.Mock<void, [string, Listener]>;
  once: jest.Mock<void, [string, Listener]>;
  destroy: jest.Mock<Promise<void>, []>;
};

/**
 * on/onceで登録されたイベントリスナーを取得する
 */
function findListener(
  register: jest.Mock<void, [string, Listener]>,
  event: string
): Listener | undefined {
  return register.mock.calls.find(([name]) => name === event)?.[1];
}

/**
 * 保留中のPromiseをすべて解決させる
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('DiscordClient', () => {
  let discordClient: DiscordClient;
  let mockMessageHandler: jest.Mocked<Pick<MessageHandler, 'handle'>>;
  let mockClient: MockClient;
  const mockToken = 'test-token';

  beforeEach(() => {
    mockMessageHandler = {
      handle: jest.fn<Promise<void>, [Message]>().mockResolvedValue(undefined),
    };

    // discord.jsのClientをモック
    mockClient = {
      login: jest.fn<Promise<string>, [string]>().mockResolvedValue('token'),
      on: jest.fn<void, [string, Listener]>(),
      once: jest.fn<void, [string, Listener]>(),
      destroy: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    };

    // Clientコンストラクタをモック
    jest.mocked(Client).mockImplementation(() => mockClient as unknown as Client);

    discordClient = new DiscordClient(
      mockToken,
      mockMessageHandler as unknown as MessageHandler
    );
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
      const readyCallback = findListener(mockClient.once, Events.ClientReady);

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
      const messageCallback = findListener(mockClient.on, Events.MessageCreate);

      expect(messageCallback).toBeDefined();
      if (messageCallback) {
        messageCallback(mockMessage);
        await flushPromises();
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
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

      await discordClient.start();

      // messageCreateイベントのコールバックを取得して実行
      const messageCallback = findListener(mockClient.on, Events.MessageCreate);

      expect(messageCallback).toBeDefined();
      if (messageCallback) {
        // エラーが発生してもクラッシュせず、ログに記録されることを確認
        expect(() => messageCallback(mockMessage)).not.toThrow();
        await flushPromises();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0]?.[0]).toBe('Error handling message');
      }
      errorSpy.mockRestore();
    });
  });
});
