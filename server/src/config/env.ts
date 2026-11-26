import { config } from 'dotenv';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  APP_ORIGIN: z.string().url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  }).default('http://127.0.0.1:5173'),
  TRUST_PROXY: z.enum(['none', 'one']).default('none'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(2160).default(720),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  DATABASE_URL: z.preprocess(value => value === '' ? undefined : value,
    z.string().url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)).optional()),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1).max(60000).default(5000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1).max(60000).default(10000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    // Report keys only: connection strings and other input may contain secrets.
    throw new Error(`Некорректные переменные окружения: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return parsed.data;
}

export function loadEnv(): Env {
  config({ path: new URL('../../.env', import.meta.url), quiet: true });
  return parseEnv(process.env);
}
