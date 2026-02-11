import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

function getLogLevel(): LogLevel {
  const envLevel = process.env['LOG_LEVEL'];
  if (
    envLevel === 'fatal' ||
    envLevel === 'error' ||
    envLevel === 'warn' ||
    envLevel === 'info' ||
    envLevel === 'debug' ||
    envLevel === 'trace'
  ) {
    return envLevel;
  }
  return 'info';
}

export const logger = pino({
  name: 'mycel',
  level: getLogLevel(),
  transport:
    process.env['NODE_ENV'] === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export function createChildLogger(component: string): pino.Logger {
  return logger.child({ component });
}
