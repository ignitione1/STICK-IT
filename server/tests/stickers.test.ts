import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { hashPassword } from '../src/modules/accounts/security.js';
import { bootstrapAdminsFromEnv } from '../src/modules/accounts/bootstrap-env.js';

async function database() {
  const pg = new PGlite();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  return { pg, db: drizzle(pg, { schema }) };
}

test('два администратора из env создаются идемпотентно без смены паролей и повышения сотрудников', async () => {
  const { pg, db } = await database();
  const env = { BOOTSTRAP_ADMIN_1_LOGIN: 'AdminOne', BOOTSTRAP_ADMIN_1_NAME: 'Первый', BOOTSTRAP_ADMIN_1_PASSWORD: 'First-admin-password-2026',
    BOOTSTRAP_ADMIN_2_LOGIN: 'admintwo', BOOTSTRAP_ADMIN_2_NAME: 'Второй', BOOTSTRAP_ADMIN_2_PASSWORD: 'Second-admin-password-2026' };
  try {
    assert.deepEqual(await bootstrapAdminsFromEnv(db as unknown as Database, env), { created: 2, unchanged: 0 });
    const before = await db.select().from(schema.employees);
    assert.deepEqual(await bootstrapAdminsFromEnv(db as unknown as Database, { ...env, BOOTSTRAP_ADMIN_1_PASSWORD: 'Changed-password-2026', BOOTSTRAP_ADMIN_1_NAME: 'Новое имя' }), { created: 0, unchanged: 2 });
    assert.deepEqual(await db.select().from(schema.employees), before);
    assert.deepEqual(await bootstrapAdminsFromEnv(db as unknown as Database, { ...env, BOOTSTRAP_ADMIN_1_PASSWORD: '', BOOTSTRAP_ADMIN_2_PASSWORD: '' }), { created: 0, unchanged: 2 });
    await assert.rejects(bootstrapAdminsFromEnv(db as unknown as Database, { ...env, BOOTSTRAP_ADMIN_2_LOGIN: 'newadmin' }));
    await db.insert(schema.employees).values({ login: 'employee', displayName: 'Сотрудник', passwordHash: 'unused-fixture-hash' });
    await assert.rejects(bootstrapAdminsFromEnv(db as unknown as Database, { ...env, BOOTSTRAP_ADMIN_2_LOGIN: 'employee' }));
    assert.equal((await db.select().from(schema.employees).where(eq(schema.employees.login, 'employee')))[0].role, 'user');
    await assert.rejects(bootstrapAdminsFromEnv(db as unknown as Database, { ...env, BOOTSTRAP_ADMIN_2_LOGIN: 'ADMINONE' }));
  } finally { await pg.close(); }
});

test('записки: адресаты, права, конфликты версий, общие координаты и архив цепочек', { timeout: 60000 }, async () => {
  const { pg, db } = await database();
  const origin = 'http://127.0.0.1:5173';
  const hash = await hashPassword('Fixture-password-2026');
  const [finance, it, legal] = await db.insert(schema.departments).values([
    { name: 'Финансы', code: 'finance', color: '#aa9933' }, { name: 'IT', code: 'it', color: '#3366aa' }, { name: 'Юристы', code: 'legal', color: '#9955aa' },
  ]).returning();
  const [board, otherBoard] = await db.insert(schema.boards).values([{ name: 'IT', departmentId: it.id }, { name: 'Финансы', departmentId: finance.id }]).returning();
  const [sender, receiver, outsider] = await db.insert(schema.employees).values([
    { login: 'sender', displayName: 'Отправитель', passwordHash: hash, paperStyle: 'blue', fastening: 'tape' },
    { login: 'receiver', displayName: 'Получатель', passwordHash: hash },
    { login: 'observer', displayName: 'Администратор', passwordHash: hash, role: 'admin' },
  ]).returning();
  await db.insert(schema.employeeDepartments).values([{ employeeId: sender.id, departmentId: finance.id, isPrimary: true },
    { employeeId: receiver.id, departmentId: it.id, isPrimary: true }, { employeeId: outsider.id, departmentId: legal.id, isPrimary: true }]);
  const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false' }), { database: db as unknown as Database });
  const signIn = async (login: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin, 'x-stickerboard-request': '1' }, payload: { login, password: 'Fixture-password-2026' } });
    assert.equal(response.statusCode, 200, response.body);
    return { cookie: String(response.headers['set-cookie']).split(';')[0], origin, 'x-stickerboard-request': '1', 'x-csrf-token': response.json().csrfToken };
  };
  try {
    const a = await signIn('sender'); const b = await signIn('receiver'); const c = await signIn('observer');
    const request = (headers: typeof a, method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) => app.inject({ method, url: '/api' + url, headers, payload });
    const list = async (headers = a) => (await app.inject({ url: '/api/stickers', headers })).json().notes as Array<Record<string, any>>;
    assert.equal((await app.inject('/api/stickers')).statusCode, 401);
    const id = randomUUID(); const payload = { id, boardId: board.id, text: 'Общая записка', paperSeed: 0, x: 40, y: 90 };
    assert.equal((await request(a, 'POST', '/stickers', payload)).statusCode, 201);
    assert.equal((await request(a, 'POST', '/stickers', payload)).statusCode, 200);
    assert.equal((await list()).length, 1);
    let root = (await list())[0];
    assert.equal(root.authorDepartmentId, finance.id);
    assert.equal(root.preset, 'blue');
    assert.equal(root.fastening, 'tape');
    assert.deepEqual(root.recipientDepartmentIds, [it.id]);
    assert.equal((await list(b))[0].canMark, true);
    assert.equal((await list(c))[0].canMark, false);
    assert.equal((await request(c, 'PATCH', '/stickers/' + id, { text: 'Чужой текст', revision: 0 })).statusCode, 403);
    assert.equal((await request(c, 'PATCH', '/stickers/' + id + '/marks', { read: true, revision: 0 })).statusCode, 403);
    assert.equal((await request(b, 'PATCH', '/stickers/' + id + '/marks', { done: true, revision: 0 })).statusCode, 409);
    assert.equal((await request(b, 'PATCH', '/stickers/' + id + '/marks', { read: true, revision: 0 })).statusCode, 200);
    assert.equal((await request(b, 'PATCH', '/stickers/' + id + '/marks', { done: true, revision: 1 })).statusCode, 200);
    assert.equal((await request(a, 'PATCH', '/stickers/' + id + '/marks', { read: false, revision: 2 })).statusCode, 200);
    root = (await list())[0];
    for (const key of ['readAt', 'readById', 'doneAt', 'doneById']) assert.equal(root[key], null);
    assert.equal(root.done, false);
    assert.equal((await request(a, 'PATCH', '/stickers/' + id, { text: 'Обновлённая записка', revision: 3 })).statusCode, 200);
    assert.equal((await request(a, 'PATCH', '/stickers/' + id, { text: 'Старая вкладка', revision: 3 })).statusCode, 409);
    const reply = await request(b, 'POST', '/stickers', { boardId: board.id, parentId: id, text: 'Ответ получателя' });
    assert.equal(reply.statusCode, 201, reply.body);
    const replyId = reply.json().id;
    assert.equal((await request(a, 'POST', '/stickers', { boardId: board.id, parentId: replyId, text: 'Ответ на ответ' })).statusCode, 201);
    assert.equal((await request(a, 'POST', '/stickers', { boardId: otherBoard.id, parentId: id, text: 'Другая доска' })).statusCode, 400);
    assert.equal((await request(c, 'PATCH', '/stickers/' + id + '/position', { x: 1500, y: 1200 })).statusCode, 200);
    assert.equal((await request(b, 'PATCH', '/stickers/' + replyId + '/position', { x: 100, y: 100 })).statusCode, 400);
    const chain = await list();
    assert.deepEqual(chain.filter(note => note.parentId).map(note => note.parentId), [id, id]);
    assert.deepEqual(chain.filter(note => note.parentId).map(note => note.replyOrder), [0, 1]);
    assert.ok(chain.filter(note => note.parentId).every(note => note.x === 26 && note.y === 0));
    assert.equal(chain.find(note => note.id === id)!.x, 1500);
    assert.equal((await request(c, 'PATCH', '/stickers/' + id + '/archive', { archived: true, revision: 4 })).statusCode, 403);
    assert.equal((await request(b, 'PATCH', '/stickers/' + replyId + '/archive', { archived: true, revision: 0 })).statusCode, 200);
    assert.equal((await request(a, 'PATCH', '/stickers/' + id + '/archive', { archived: true, revision: 4 })).statusCode, 200);
    assert.ok((await list()).every(note => note.isArchived));
    assert.equal((await request(b, 'PATCH', '/stickers/' + replyId + '/archive', { archived: false, revision: 1 })).statusCode, 409);
    assert.equal((await request(a, 'PATCH', '/stickers/' + id + '/archive', { archived: false, revision: 5 })).statusCode, 200);
    assert.equal((await list()).filter(note => note.isArchived).length, 1);
    assert.equal((await request(b, 'PATCH', '/stickers/' + replyId + '/archive', { archived: false, revision: 1 })).statusCode, 200);
    await db.update(schema.employees).set({ paperStyle: 'lavender', fastening: 'clip' }).where(eq(schema.employees.id, sender.id));
    assert.equal((await list()).find(note => note.id === id)!.fastening, 'tape');
    await db.update(schema.employeeDepartments).set({ departmentId: legal.id }).where(eq(schema.employeeDepartments.employeeId, sender.id));
    root = (await list()).find(note => note.id === id)!;
    assert.equal(root.authorDepartmentId, finance.id); assert.equal(root.preset, 'blue');
    assert.equal((await request(a, 'POST', '/stickers', { boardId: board.id, text: 'Поддельный автор', authorId: outsider.id })).statusCode, 400);
  } finally { await app.close(); await pg.close(); }
});
