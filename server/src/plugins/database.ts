import fp from 'fastify-plugin';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.js';
import * as schema from '../db/index.js';
export type Database = NodePgDatabase<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: NodePgDatabase<typeof schema> | null;
  }
}

export default fp<{ env: Env }>(async (app, { env }) => {
  app.decorate('db', null);
  if (!env.DATABASE_URL) {
    app.log.warn('DATABASE_URL не задана: PostgreSQL отключена; health проверяет только HTTP-сервер');
    return;
  }

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    query_timeout: env.DB_QUERY_TIMEOUT_MS,
    statement_timeout: env.DB_QUERY_TIMEOUT_MS,
  });
  pool.on('error', () => app.log.error('Ошибка фонового соединения PostgreSQL'));
  app.addHook('onClose', async () => { await pool.end(); });
  try {
    await pool.query('select 1');
  } catch {
    // The underlying error can contain credentials; keep startup output safe.
    throw new Error('Не удалось подключиться к PostgreSQL. Проверьте DATABASE_URL и доступность базы.');
  }
  app.db = drizzle({ client: pool, schema });
  app.log.info('Подключение к PostgreSQL проверено');
}, { name: 'database' });
