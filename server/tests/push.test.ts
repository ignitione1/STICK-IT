import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { hashPassword } from '../src/modules/accounts/security.js';

test('push-подписка требует сессию и CSRF, запрещает чужие адреса и удаляется пользователем', async () => {
  const pg = new PGlite();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  const db = drizzle(pg, { schema });
  await db.insert(schema.employees).values({ login: 'pushuser', displayName: 'Пользователь', passwordHash: await hashPassword('Fixture-password-2026') });
  const origin = 'http://127.0.0.1:5173';
  const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private' }), { database: db as unknown as Database });
  try {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin, 'x-stickerboard-request': '1' }, payload: { login: 'pushuser', password: 'Fixture-password-2026' } });
    assert.equal(login.statusCode, 200);
    const headers = { cookie: String(login.headers['set-cookie']).split(';')[0], origin, 'x-stickerboard-request': '1', 'x-csrf-token': login.json().csrfToken };
    const value = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } };
    assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscription', payload: value })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscription', headers: { ...headers, 'x-csrf-token': 'wrong' }, payload: value })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscription', headers, payload: { ...value, endpoint: 'https://127.0.0.1/private' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscription', headers, payload: value })).statusCode, 200);
    assert.equal((await db.select().from(schema.pushSubscriptions)).length, 1);
    const status = await app.inject({ url: '/api/push/status', headers });
    assert.deepEqual(status.json(), { activeSubscriptions: 1, latestDelivery: null });
    assert.equal(status.body.includes(value.endpoint), false);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/push/subscription', headers, payload: { endpoint: value.endpoint } })).statusCode, 200);
    assert.equal((await db.select().from(schema.pushSubscriptions)).length, 0);
  } finally { await app.close(); await pg.close(); }
});

 test('push получают активные адресаты отдела и личный адресат, без автора и посторонних', async () => {
  const pg = new PGlite();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  const db = drizzle(pg, { schema });
  try {
    const [department, other] = await db.insert(schema.departments).values([{ name: 'IT', code: 'it', color: '#3366aa' }, { name: 'Другой', code: 'other', color: '#3366aa' }]).returning();
    const [board] = await db.insert(schema.boards).values({ name: 'IT', departmentId: department.id }).returning();
    const people = await db.insert(schema.employees).values(['author', 'one', 'two', 'outsider'].map(login => ({ login, displayName: login, passwordHash: 'fixture' }))).returning();
    await db.insert(schema.employeeDepartments).values(people.map((person, i) => ({ employeeId: person.id, departmentId: i === 3 ? other.id : department.id })));
    const sessions = await db.insert(schema.sessions).values(people.map((person, i) => ({ employeeId: person.id, tokenHash: String(i).repeat(64), expiresAt: new Date(Date.now() + 60000) }))).returning();
    await db.insert(schema.pushSubscriptions).values(people.map((person, i) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, employeeId: person.id, sessionId: sessions[i].id, p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) })));
    const [note] = await db.insert(schema.stickers).values({ boardId: board.id, authorId: people[0].id, authorDepartmentId: department.id, text: 'Текст не должен попадать в push', paperStyle: 'yellow', paperSeed: 1 }).returning();
    await db.insert(schema.stickerDepartmentRecipients).values({ stickerId: note.id, departmentId: department.id });
    await db.insert(schema.stickerEmployeeRecipients).values({ stickerId: note.id, employeeId: people[1].id });
    const sent: Array<{ endpoint: string; payload: string; urgency: string | undefined }> = [];
    const fake = async (subscription: { endpoint: string }, payload?: string | Buffer | null, options?: { urgency?: string }) => {
      sent.push({ endpoint: subscription.endpoint, payload: String(payload), urgency: options?.urgency });
      return { statusCode: 201, headers: {}, body: '' };
    };
    const { sendNotePush, sendCompletionPush } = await import('../src/modules/push/routes.js');
    await sendNotePush(db as unknown as Database, parseEnv({ VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' }), note.id, fake);
    assert.deepEqual(sent.map(item => item.endpoint).sort(), ['https://fcm.googleapis.com/fcm/send/1', 'https://fcm.googleapis.com/fcm/send/2']);
    assert.ok(sent.every(item => !item.payload.includes(note.text) && JSON.parse(item.payload).reply === false));
    assert.ok(sent.every(item => item.urgency === 'high'));
    sent.length = 0;
    await sendCompletionPush(db as unknown as Database, parseEnv({ VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' }), note.id, 2, fake);
    assert.deepEqual(sent.map(item => item.endpoint), ['https://fcm.googleapis.com/fcm/send/0']);
    assert.equal(JSON.parse(sent[0].payload).completed, true);
    assert.equal(JSON.parse(sent[0].payload).eventId, `${note.id}:done:2`);
    assert.ok(!sent[0].payload.includes(note.text));
  } finally { await pg.close(); }
});
