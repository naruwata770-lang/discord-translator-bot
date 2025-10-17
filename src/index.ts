import { DiscordClient } from './discord/discordClient';
import { MessageHandler } from './discord/messageHandler';
import { MessageDispatcher } from './discord/messageDispatcher';
import { CommandParser } from './commands/commandParser';
import { TranslationService } from './services/translationService';
import { PoeApiClient } from './services/poeApiClient';
import { LanguageDetector } from './services/languageDetector';
import { RateLimiter } from './services/rateLimiter';
import config from './config/config';
import logger from './utils/logger';

async function main() {
  try {
    logger.info('Starting Discord translation bot');

    // 依存関係の初期化
    const languageDetector = new LanguageDetector();
    const rateLimiter = new RateLimiter(
      config.rateLimitConcurrent,
      config.rateLimitInterval
    );
    const poeApiClient = new PoeApiClient(
      config.poeApiKey,
      config.poeEndpointUrl,
      config.poeModelName
    );
    const translationService = new TranslationService(
      poeApiClient,
      languageDetector,
      rateLimiter
    );
    const commandParser = new CommandParser();
    const dispatcher = new MessageDispatcher();
    const messageHandler = new MessageHandler(
      commandParser,
      translationService,
      dispatcher,
      config.targetChannels
    );

    // DiscordClientの初期化と起動
    const discordClient = new DiscordClient(
      config.discordBotToken,
      messageHandler
    );

    await discordClient.start();

    // グレースフルシャットダウン
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      await discordClient.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    logger.info('Discord translation bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  }
}

main();
