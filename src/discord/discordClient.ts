import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  Partials,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from 'discord.js';
import { MessageHandler } from './messageHandler';
import { ReactionHandler } from './reactionHandler';
import logger from '../utils/logger';

export class DiscordClient {
  private client: Client;

  constructor(
    private token: string,
    private messageHandler: MessageHandler,
    private reactionHandler?: ReactionHandler
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
    });
  }

  async start(): Promise<void> {
    // readyイベント
    this.client.once(Events.ClientReady, (client) => {
      logger.info('Discord bot is ready', {
        tag: client.user.tag,
        guilds: client.guilds.cache.size,
      });

      // ReactionHandlerにbotUserIdを設定
      if (this.reactionHandler) {
        this.reactionHandler.setBotUserId(client.user.id);
        logger.info('Retry feature enabled', { botUserId: client.user.id });
      }
    });

    // messageCreateイベント
    // discord.js のリスナーは戻り値の Promise を扱わないため、
    // 例外処理を内包した async メソッドを void で呼び出す
    this.client.on(Events.MessageCreate, (message: Message) => {
      void this.onMessageCreate(message);
    });

    // messageReactionAddイベント（リトライ機能）
    const reactionHandler = this.reactionHandler;
    if (reactionHandler) {
      this.client.on(
        Events.MessageReactionAdd,
        (
          reaction: MessageReaction | PartialMessageReaction,
          user: User | PartialUser
        ) => {
          void this.onMessageReactionAdd(reactionHandler, reaction, user);
        }
      );
    }

    // エラーイベント
    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });
    });

    // ログイン
    logger.info('Attempting to login to Discord');
    try {
      await this.client.login(this.token);
      logger.info('Discord login successful');
    } catch (error) {
      logger.error('Discord login failed', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });
      throw error;
    }
  }

  private async onMessageCreate(message: Message): Promise<void> {
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
  }

  private async onMessageReactionAdd(
    reactionHandler: ReactionHandler,
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    try {
      await reactionHandler.handle(
        reaction as MessageReaction,
        user as User
      );
    } catch (error) {
      logger.error('Error handling reaction', {
        messageId: reaction.message.id,
        emoji: reaction.emoji.name,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      });
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Discord bot');
    await this.client.destroy();
  }
}
