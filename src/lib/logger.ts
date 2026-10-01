import pino from 'pino';
import { env } from './config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});
