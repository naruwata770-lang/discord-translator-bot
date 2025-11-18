import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  Partials,
} from 'discord.js';
import { MessageHandler } from './messageHandler';
import logger from '../utils/logger';

export class DiscordClient {
  private client: Client;

  constructor(
    private token: string,
    private messageHandler: MessageHandler
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // サーバープロフィール取得に必要
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  async start(): Promise<void> {
    // readyイベント
    this.client.once(Events.ClientReady, (client) => {
      logger.info('Discord bot is ready', {
        tag: client.user.tag,
        guilds: client.guilds.cache.size,
      });
    });

    // messageCreateイベント
    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        await this.messageHandler.handle(message);
      } catch (error) {
        logger.error('Error handling message', {
          messageId: message.id,
          channelId: message.channelId,
          content: message.content.substring(0, 50), // 最初の50文字のみ
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
        });
      }
    });

    // エラーイベント
    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', { error });
    });

    // ログイン
    await this.client.login(this.token);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Discord bot');
    await this.client.destroy();
  }
}
