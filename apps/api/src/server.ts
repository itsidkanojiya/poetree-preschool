import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './db/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('API listening', { port: env.PORT, env: env.NODE_ENV });
});

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutting down', { signal });

  server.close(() => {
    void disconnectPrisma().then(() => process.exit(0));
  });

  // Do not let a hung connection hold the deploy open indefinitely.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
