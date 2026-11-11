import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'dotenv';
import { openLocalDatabase } from '../scripts/local-database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { departments, employees } from '../src/db/schema.js';

test('локальная база сохраняет данные и администраторов после перезапуска', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stickerboard-local-'));
  const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
  let local: Awaited<ReturnType<typeof openLocalDatabase>> | undefined;
  try {
    local = await openLocalDatabase(directory, migrations);
    const credentials = await readFile(local.credentialsPath, 'utf8');
    const env = parse(credentials);
    const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false' }), { database: local.database });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login',
        headers: { origin: 'http://127.0.0.1:5173', 'x-stickerboard-request': '1' },
        payload: { login: env.BOOTSTRAP_ADMIN_1_LOGIN, password: env.BOOTSTRAP_ADMIN_1_PASSWORD } });
      assert.equal(response.statusCode, 200);
      assert.equal((await app.inject({ method: 'POST', url: '/__test/reset', payload: {} })).statusCode, 404);
    } finally { await app.close(); }
    const before = await local.database.select().from(employees);
    await local.database.insert(departments).values({ name: 'Сохранённый отдел', code: 'persist', color: '#123456' });
    await local.close();
    local = undefined;
    local = await openLocalDatabase(directory, migrations);
    assert.equal(await readFile(local.credentialsPath, 'utf8'), credentials);
    assert.deepEqual(await local.database.select().from(employees), before);
    assert.equal((await local.database.select().from(departments))[0].name, 'Сохранённый отдел');
  } finally {
    await local?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
