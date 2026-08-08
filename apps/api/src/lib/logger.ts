import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVEL_WEIGHT[env.LOG_LEVEL];

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };

  const serialised = env.isProduction ? JSON.stringify(line) : formatForHumans(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else process.stdout.write(`${serialised}\n`);
}

function formatForHumans(line: Record<string, unknown>): string {
  const { ts, level, msg, ...rest } = line;
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${String(ts).slice(11, 23)} ${String(level).toUpperCase().padEnd(5)} ${String(msg)}${extras}`;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
