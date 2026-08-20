import pino from 'pino'
import type { AppConfig } from './config.js'

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL'>) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.access_token',
        '*.id_token',
        '*.refresh_token',
        '*.client_secret',
        '*.code',
        '*.code_verifier',
        '*.password',
        '*.email',
      ],
      censor: '[REDACTED]',
    },
  })
}

export type Logger = ReturnType<typeof createLogger>
