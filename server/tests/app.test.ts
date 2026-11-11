import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const env = () => parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

test('доверие прокси ограничено одним переходом и отключено по умолчанию', async () => {
  for (const trust of ['none', 'one'] as const) {
    const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', TRUST_PROXY: trust }));
    app.get('/request-ip', request => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: '/request-ip', remoteAddress: '10.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.12' } });
      assert.equal(response.json().ip, trust === 'one' ? '198.51.100.12' : '10.0.0.1');
    } finally { await app.close(); }
  }
});

test('health и 404 работают без PostgreSQL', async () => {
  const app = buildApp(env());
  try {
    const response = await app.inject('/api/health');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    assert.equal(app.db, null);
    assert.equal((await app.inject('/api/users')).statusCode, 404);
  } finally {
    await app.close();
  }
});

test('обработчик ошибок скрывает детали исключений', async () => {
  const app = buildApp(env());
  app.get('/failure', () => { throw new Error('private database credentials'); });
  try {
    const response = await app.inject('/failure');
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: 'Внутренняя ошибка сервера' });
    assert.ok(!response.body.includes('private'));
  } finally {
    await app.close();
  }
});

test('окружение валидируется без раскрытия секретов', () => {
  const config = parseEnv({ DATABASE_URL: 'postgresql://role:secret@127.0.0.1:5432/board', PORT: '3100' });
  assert.equal(config.PORT, 3100);
  assert.equal(config.DB_POOL_MAX, 10);
  assert.equal(env().DATABASE_URL, undefined);
  for (const input of [{ PORT: '0' }, { PORT: 'abc' }, { DATABASE_URL: 'https://host/db' }, { DB_POOL_MAX: '0' }]) {
    assert.throws(() => parseEnv(input), /Некорректные переменные окружения/);
  }
  assert.throws(() => parseEnv({ DATABASE_URL: 'secret-invalid-url' }), error => {
    assert.ok(error instanceof Error && !error.message.includes('secret-invalid-url'));
    return true;
  });
});

test('ошибка PostgreSQL прерывает запуск и позволяет закрыть приложение', async () => {
  // A local TCP endpoint deliberately rejects the protocol; no real DB or credentials.
  const endpoint = createServer(socket => socket.destroy());
  endpoint.listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const address = endpoint.address();
  assert.ok(address && typeof address !== 'string');
  const app = buildApp({ ...env(), DATABASE_URL: `postgresql://test:secret@127.0.0.1:${address.port}/test` });
  try {
    await assert.rejects(async () => { await app.ready(); }, /Не удалось подключиться к PostgreSQL/);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) => endpoint.close(error => error ? reject(error) : resolve()));
  }
});
