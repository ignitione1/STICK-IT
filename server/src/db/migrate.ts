import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { loadEnv } from '../config/env.js';
import { validateMigrationTarget } from './migration-config.js';

async function main() {
  const env = loadEnv();
  const target = validateMigrationTarget(env, process.env);
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  if (!readMigrationFiles({ migrationsFolder }).length) throw new Error('SQL-миграции не найдены');
  console.log('Конфигурация и файлы миграций проверены');
  const pool = new pg.Pool({
    connectionString: target.connectionString,
    max: 1,
    connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
    query_timeout: 60000,
    statement_timeout: 60000,
  });
  pool.on('error', () => console.error('Ошибка фонового соединения при миграции'));
  try {
    const client = await pool.connect();
    let locked = false;
    try {
      const result = await client.query<{ database: string; user: string; superuser: boolean }>(
        'SELECT current_database() AS database, current_user AS "user", rolsuper AS superuser FROM pg_roles WHERE rolname = current_user',
      );
      const actual = result.rows[0];
      if (!actual || actual.database !== target.database || actual.user !== target.user || actual.superuser) {
        throw new Error('Подключение не соответствует ожидаемой базе или роли приложения');
      }
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('stickerboard:migrations')) AS locked",
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) throw new Error('Другой процесс уже выполняет миграции');
      // Explicit operator command only; the API entry point never imports this file.
      await migrate(drizzle({ client }), { migrationsFolder });
      console.log('Миграции успешно применены');
    } finally {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('stickerboard:migrations'))");
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // SQL exceptions may contain sensitive connection details or statement values.
  console.error('Миграция не выполнена. Проверьте конфигурацию, доступность БД, роль, журнал миграций и отсутствие другого процесса миграции.');
  process.exitCode = 1;
});
