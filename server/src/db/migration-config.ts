import type { Env } from '../config/env.js';

export interface MigrationTarget {
  connectionString: string;
  database: string;
  user: string;
}

// Deployment migrations must target the app role and DB of this Compose stack.
// Validate before opening a connection; never include the URL/password in errors.
export function validateMigrationTarget(env: Env, input: NodeJS.ProcessEnv): MigrationTarget {
  if (!env.DATABASE_URL) throw new Error('Для миграции требуется DATABASE_URL');
  const database = input.POSTGRES_DB;
  const user = input.POSTGRES_APP_USER;
  if (!database || !user) throw new Error('Для миграции требуются POSTGRES_DB и POSTGRES_APP_USER');
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== 'postgres' || (url.port && url.port !== '5432')
    || decodeURIComponent(url.pathname.slice(1)) !== database
    || decodeURIComponent(url.username) !== user || !url.password
    || url.search || url.hash || user === 'postgres') {
    throw new Error('DATABASE_URL должна указывать на postgres:5432, выбранную базу и роль приложения без дополнительных параметров');
  }
  return { connectionString: env.DATABASE_URL, database, user };
}
