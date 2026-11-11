import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { bootstrapAdminsFromEnv } from '../src/modules/accounts/bootstrap-env.js';

// This explicit development entry point never reads DATABASE_URL or existing .env files.
export async function openLocalDatabase(directory: string, migrationsFolder: string) {
  await mkdir(directory, { recursive: true });
  const credentialsPath = join(directory, 'local-admins.env');
  const credentials = [1, 2].map(index =>
    `BOOTSTRAP_ADMIN_${index}_LOGIN=admin${index}\nBOOTSTRAP_ADMIN_${index}_NAME="Локальный администратор ${index}"\nBOOTSTRAP_ADMIN_${index}_PASSWORD=${randomBytes(24).toString('base64url')}\n`,
  ).join('\n');
  try {
    await writeFile(credentialsPath, credentials, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const pg = new PGlite(join(directory, 'postgres'));
  try {
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder });
    const database = db as unknown as Database;
    await bootstrapAdminsFromEnv(database, parse(await readFile(credentialsPath)));
    return { database, credentialsPath, close: () => pg.close() };
  } catch (error) {
    await pg.close();
    throw error;
  }
}
