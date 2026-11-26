import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { bootstrapAdmin } from '../src/modules/accounts/bootstrap.js';

test('вход, права, отделы, профиль, сброс пароля и отзыв сессий на PostgreSQL в памяти', { timeout: 60000 }, async () => {
  const pg = new PGlite();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  const db = drizzle(pg, { schema });
  const typedDb = db as unknown as Database;
  await bootstrapAdmin(typedDb, { login: 'admin', displayName: 'Администратор', password: 'Admin-test-password-2026' });
  await assert.rejects(bootstrapAdmin(typedDb, { login: 'second', displayName: 'Другой', password: 'Another-test-password-2026' }));
  const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false' }), { database: typedDb });
  const origin = 'http://127.0.0.1:5173';
  let ip = 1;
  const signIn = (login: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login',
    remoteAddress: `10.0.0.${ip++}`, headers: { origin, 'x-stickerboard-request': '1' }, payload: { login, password } });
  const credentials = (response: Awaited<ReturnType<typeof signIn>>) => ({
    cookie: String(response.headers['set-cookie']).split(';')[0], origin,
    'x-stickerboard-request': '1', 'x-csrf-token': response.json().csrfToken,
  });
  try {
    assert.equal((await app.inject('/api/admin/employees')).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'x' } })).statusCode, 403);
    const admin = await signIn('ADMIN', 'Admin-test-password-2026');
    assert.equal(admin.statusCode, 200, admin.body);
    assert.match(String(admin.headers['set-cookie']), /HttpOnly/);
    assert.match(String(admin.headers['set-cookie']), /SameSite=Strict/i);
    assert.ok(!admin.body.includes('passwordHash'));
    const adminHeaders = credentials(admin);
    const [adminSession] = await db.select().from(schema.sessions).where(eq(schema.sessions.employeeId, admin.json().employee.id));
    assert.ok(adminSession.expiresAt.getTime() - Date.now() > 29 * 24 * 3600000);
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() + 3600000) }).where(eq(schema.sessions.id, adminSession.id));
    const renewed = await app.inject({ url: '/api/auth/me', headers: adminHeaders });
    assert.equal(renewed.statusCode, 200);
    assert.match(String(renewed.headers['set-cookie']), /Max-Age=2592000/);
    const [extended] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, adminSession.id));
    assert.ok(extended.expiresAt.getTime() - Date.now() > 29 * 24 * 3600000);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: adminHeaders })).headers['set-cookie'], undefined);
    const expiredLogin = await signIn('admin', 'Admin-test-password-2026');
    const adminSessions = await db.select().from(schema.sessions).where(eq(schema.sessions.employeeId, admin.json().employee.id));
    const expiredSession = adminSessions.find(session => session.id !== adminSession.id)!;
    await db.update(schema.sessions).set({ createdAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.id, expiredSession.id));
    const expiredResponse = await app.inject({ url: '/api/auth/me', headers: credentials(expiredLogin) });
    assert.equal(expiredResponse.statusCode, 401);
    assert.equal(expiredResponse.headers['set-cookie'], undefined);
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/departments', headers: { cookie: adminHeaders.cookie }, payload: {} })).statusCode, 403);
    const division = await app.inject({ method: 'POST', url: '/api/admin/departments', headers: adminHeaders,
      payload: { name: 'IT', code: 'it', color: '#2760db' } });
    assert.equal(division.statusCode, 201, division.body);
    const departmentId = division.json().id;
    const personBody = { login: 'employee', displayName: 'Сотрудник', password: '123456', role: 'user',
      departmentIds: [departmentId], primaryDepartmentId: departmentId };
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/employees', headers: adminHeaders, payload: { ...personBody, password: '12345' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/employees', headers: adminHeaders, payload: { ...personBody, role: 'admin' } })).statusCode, 400);
    const person = await app.inject({ method: 'POST', url: '/api/admin/employees', headers: adminHeaders, payload: personBody });
    assert.equal(person.statusCode, 201, person.body);
    const id = person.json().id;
    const employeeSession = await signIn('employee', personBody.password);
    assert.equal(employeeSession.statusCode, 200, employeeSession.body);
    const employeeHeaders = credentials(employeeSession);
    assert.equal((await app.inject({ url: '/api/admin/employees', headers: employeeHeaders })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/departments', headers: employeeHeaders, payload: { name: 'Взлом' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/profile', headers: employeeHeaders,
      payload: { avatarId: 'avatar-2', paperStyle: 'mint', displayName: 'Другое имя', role: 'admin' } })).statusCode, 400);
    const profile = await app.inject({ method: 'PATCH', url: '/api/profile', headers: employeeHeaders, payload: { avatarId: 'avatar-2', paperStyle: 'mint' } });
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json().employee.paperStyle, 'mint');
    assert.equal(profile.json().employee.displayName, 'Сотрудник');
    const catalog = (await app.inject({ url: '/api/profile/catalog', headers: employeeHeaders })).json();
    assert.equal(catalog.styles.length, 10);
    assert.equal(catalog.avatars.filter((avatar: { gender: string }) => avatar.gender === 'male').length, 6);
    assert.equal(catalog.avatars.filter((avatar: { gender: string }) => avatar.gender === 'female').length, 6);
    assert.equal(catalog.fastenings.length, 4);
    for (const paperStyle of catalog.styles.map((style: { id: string }) => style.id)) {
      const result = await app.inject({ method: 'PATCH', url: '/api/profile', headers: employeeHeaders,
        payload: { paperStyle, fastening: 'clip' } });
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().employee.fastening, 'clip');
      assert.equal(result.json().employee.avatarUrl, profile.json().employee.avatarUrl);
    }
    for (const invalid of [{ avatarPhoto: 'data:image/svg+xml;base64,PHN2Zz4=' }, { avatarPhoto: 'https://example.com/a.jpg' },
      { avatarPhoto: 'data:image/jpeg;base64,YWJjZA==' }, { fastening: 'arbitrary' }, { paperStyle: 'arbitrary' }]) {
      assert.equal((await app.inject({ method: 'PATCH', url: '/api/profile', headers: employeeHeaders,
        payload: { paperStyle: 'mint', ...invalid } })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/profile', headers: employeeHeaders,
      payload: { paperStyle: 'mint' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/profile', headers: { ...employeeHeaders, 'x-csrf-token': 'я'.repeat(64) },
      payload: { avatarId: 'avatar-2', paperStyle: 'mint' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/profile', headers: { ...employeeHeaders, origin: 'https://another.example' },
      payload: { avatarId: 'avatar-2', paperStyle: 'mint' } })).statusCode, 403);
    const blockedDelete = await app.inject({ method: 'DELETE', url: `/api/admin/departments/${departmentId}`, headers: adminHeaders });
    assert.equal(blockedDelete.statusCode, 409);
    const self = admin.json().employee;
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/admin/employees/${self.id}`, headers: adminHeaders,
      payload: { ...personBody, password: undefined, login: self.login, displayName: self.displayName, role: 'user', isActive: true } })).statusCode, 403);
    const reset = await app.inject({ method: 'PATCH', url: `/api/admin/employees/${id}`, headers: adminHeaders,
      payload: { ...personBody, isActive: true, password: 'New-employee-password-2026' } });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: employeeHeaders })).statusCode, 401);
    assert.equal((await signIn('employee', personBody.password)).statusCode, 401);
    const fresh = await signIn('employee', 'New-employee-password-2026');
    assert.equal(fresh.statusCode, 200);
    assert.equal(fresh.json().employee.paperStyle, 'mint');
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await signIn('employee', 'Incorrect-password-2026')).statusCode, 401);
    assert.equal((await signIn('employee', 'New-employee-password-2026')).statusCode, 401);
    await db.update(schema.employees).set({ loginBlockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.employees.id, id));
    assert.equal((await signIn('employee', 'New-employee-password-2026')).statusCode, 200);
    const deactivate = await app.inject({ method: 'PATCH', url: `/api/admin/employees/${id}`, headers: adminHeaders,
      payload: { ...personBody, password: undefined, isActive: false } });
    assert.equal(deactivate.statusCode, 200, deactivate.body);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: credentials(fresh) })).statusCode, 401);
    assert.equal((await signIn('employee', 'New-employee-password-2026')).statusCode, 401);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/departments/${departmentId}`, headers: adminHeaders })).statusCode, 200);
    assert.equal((await db.select().from(schema.departments).where(eq(schema.departments.id, departmentId)))[0].isActive, false);
    const stored = await db.select().from(schema.sessions);
    assert.ok(stored.every(session => /^[0-9a-f]{64}$/.test(session.tokenHash)));
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: adminHeaders })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: adminHeaders })).statusCode, 401);
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '198.51.100.2',
        headers: { origin, 'x-stickerboard-request': '1' }, payload: { login: 'unknown', password: 'Invalid-password-2026' } });
      assert.equal(response.statusCode, attempt === 10 ? 429 : 401);
    }
  } finally { await app.close(); await pg.close(); }
});
