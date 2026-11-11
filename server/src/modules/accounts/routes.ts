import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import rateLimit from '@fastify/rate-limit';
import type { Env } from '../../config/env.js';
import type { Database } from '../../plugins/database.js';
import { boards, departments, employeeDepartments, employees, sessions } from '../../db/schema.js';
import type { Employee } from '../../db/schema.js';
import { avatars, styles, fastenings } from './catalog.js';
import { AccountError, csrfToken, hashPassword, newToken, tokenHash, verifyPassword } from './security.js';
import { access } from './access.js';
import type { Actor } from './access.js';
import { departmentInput, parse, parseId, personInput, personUpdate, profileInput } from './validation.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function employeeDto(employee: Employee) {
  return { id: employee.id, login: employee.login, displayName: employee.displayName,
    avatarUrl: employee.avatarUrl, role: employee.role, isActive: employee.isActive, paperStyle: employee.paperStyle, fastening: employee.fastening };
}

export const accountRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(rateLimit, { global: false, max: 10, timeWindow: '1 minute' });
  const { database, authenticate, origin, write, admin } = access(app, env);
  const memberships = (id: string) => database().select({ departmentId: employeeDepartments.departmentId,
    isPrimary: employeeDepartments.isPrimary }).from(employeeDepartments).where(eq(employeeDepartments.employeeId, id));
  const me = async (actor: Actor) => ({ employee: { ...employeeDto(actor.employee), departments: await memberships(actor.employee.id) }, csrfToken: csrfToken(actor.token) });
  const cookieOptions = { path: '/api', httpOnly: true, sameSite: 'strict' as const, secure: env.COOKIE_SECURE };
  const adminWrite = [admin, write];
  const adminTransaction = async <T>(request: FastifyRequest, action: (tx: Transaction) => Promise<T>) => database().transaction(async tx => {
    // Serialize account/department edits, including last-admin and membership checks.
    await tx.execute(sql`select pg_advisory_xact_lock(73194210)`);
    const [actor] = await tx.select().from(employees).where(eq(employees.id, request.actor!.employee.id));
    if (!actor?.isActive || actor.role !== 'admin') throw new AccountError(403, 'Права администратора изменились');
    return action(tx);
  });
  const setDepartments = async (tx: Transaction, employeeId: string, ids: string[], primary: string) => {
    if (new Set(ids).size !== ids.length || !ids.includes(primary)) throw new AccountError(400, 'Выберите один основной отдел из назначенных');
    for (const id of ids) {
      const [department] = await tx.select().from(departments).where(and(eq(departments.id, id), eq(departments.isActive, true)));
      if (!department) throw new AccountError(400, 'Отдел не найден или удалён');
    }
    await tx.delete(employeeDepartments).where(eq(employeeDepartments.employeeId, employeeId));
    await tx.insert(employeeDepartments).values(ids.map(departmentId => ({ employeeId, departmentId, isPrimary: departmentId === primary })));
  };
  const dummyHash = await hashPassword(newToken());

  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.post('/auth/login', { bodyLimit: 4096, preHandler: origin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = parse(z.object({ login: z.string().trim().toLowerCase().min(1).max(128), password: z.string().min(1).max(128) }).strict(), request.body);
    const db = database();
    const [found] = await db.select().from(employees).where(sql`lower(${employees.login}) = ${input.login}`);
    const valid = await verifyPassword(found?.passwordHash ?? dummyHash, input.password);
    if (!found || !valid || !found.isActive || (found.loginBlockedUntil && found.loginBlockedUntil > new Date())) {
      if (found && !valid) await db.update(employees).set({
        failedLoginCount: sql`${employees.failedLoginCount} + 1`,
        loginBlockedUntil: sql`case when ${employees.failedLoginCount} >= 4 then now() + interval '15 minutes' else ${employees.loginBlockedUntil} end`,
      }).where(eq(employees.id, found.id));
      throw new AccountError(401, 'Не удалось войти. Проверьте логин и пароль или обратитесь к администратору.');
    }
    const token = newToken();
    const session = await db.transaction(async tx => {
      const [current] = await tx.select().from(employees).where(eq(employees.id, found.id)).for('update');
      if (!current?.isActive || current.passwordHash !== found.passwordHash
        || (current.loginBlockedUntil && current.loginBlockedUntil > new Date())) throw new AccountError(401, 'Повторите вход');
      await tx.update(employees).set({ failedLoginCount: 0, loginBlockedUntil: null }).where(eq(employees.id, found.id));
      const [created] = await tx.insert(sessions).values({ employeeId: found.id, tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + env.SESSION_HOURS * 3600000) }).returning();
      return created;
    });
    reply.setCookie('stickerboard_session', token, { ...cookieOptions, maxAge: env.SESSION_HOURS * 3600 });
    return me({ employee: found, token, sessionId: session.id });
  });
  app.get('/auth/me', { preHandler: authenticate }, request => me(request.actor!));
  app.post('/auth/logout', { preHandler: [authenticate, write] }, async (request, reply) => {
    await database().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, request.actor!.sessionId));
    reply.clearCookie('stickerboard_session', cookieOptions);
    return { ok: true };
  });
  app.get('/profile/catalog', { preHandler: authenticate }, async () => ({ styles, avatars, fastenings }));
  app.get<{ Params: { id: string } }>('/profile/avatar/:id', { preHandler: authenticate }, async (request, reply) => {
    const id = parseId(request.params.id);
    const [person] = await database().select({ photo: employees.avatarPhoto }).from(employees).where(eq(employees.id, id));
    if (!person?.photo) throw new AccountError(404, 'Фото не найдено');
    return reply.header('X-Content-Type-Options', 'nosniff').type('image/jpeg')
      .send(Buffer.from(person.photo.slice('data:image/jpeg;base64,'.length), 'base64'));
  });
  app.patch('/profile', { bodyLimit: 180000, preHandler: [authenticate, write] }, async request => {
    const parsed = profileInput.safeParse(request.body);
    if (!parsed.success) throw new AccountError(400, 'Проверьте аватар, дизайн бумаги и крепление. Для своего фото выберите JPG, PNG или WebP через кнопку загрузки.');
    const input = parsed.data;
    const [updated] = await database().update(employees).set({
      ...(input.avatarId ? { avatarUrl: avatars.find(avatar => avatar.id === input.avatarId)!.url, avatarPhoto: null } : {}),
      ...(input.avatarPhoto ? { avatarUrl: `/api/profile/avatar/${request.actor!.employee.id}?v=${randomUUID()}`, avatarPhoto: input.avatarPhoto } : {}), paperStyle: input.paperStyle,
      ...(input.fastening ? { fastening: input.fastening } : {}),
    }).where(eq(employees.id, request.actor!.employee.id)).returning();
    return { employee: { ...employeeDto(updated), departments: await memberships(updated.id) } };
  });
  app.get('/directory', { preHandler: authenticate }, async () => {
    const db = database();
    const departmentRows = await db.select().from(departments).orderBy(departments.name);
    const boardRows = await db.select().from(boards).orderBy(boards.createdAt);
    const people = await db.select({ id: employees.id, displayName: employees.displayName,
      avatarUrl: employees.avatarUrl, paperStyle: employees.paperStyle, isActive: employees.isActive }).from(employees);
    return { departments: departmentRows, boards: boardRows, employees: people,
      memberships: await db.select().from(employeeDepartments) };
  });
  app.get('/admin/departments', { preHandler: admin }, () => database().select().from(departments).orderBy(departments.name));
  app.post('/admin/departments', { preHandler: adminWrite }, async (request, reply) => {
    const input = parse(departmentInput, request.body);
    const created = await adminTransaction(request, async tx => {
      const [department] = await tx.insert(departments).values(input).returning();
      await tx.insert(boards).values({ name: input.name, departmentId: department.id });
      return department;
    });
    return reply.code(201).send(created);
  });
  app.patch<{ Params: { id: string } }>('/admin/departments/:id', { preHandler: adminWrite }, async request => {
    const id = parseId(request.params.id);
    const input = parse(departmentInput, request.body);
    return adminTransaction(request, async tx => {
      const [department] = await tx.update(departments).set(input).where(and(eq(departments.id, id), eq(departments.isActive, true))).returning();
      if (!department) throw new AccountError(404, 'Активный отдел не найден');
      await tx.update(boards).set({ name: input.name }).where(eq(boards.departmentId, id));
      return department;
    });
  });
  app.delete<{ Params: { id: string } }>('/admin/departments/:id', { preHandler: adminWrite }, async request => {
    const id = parseId(request.params.id);
    return adminTransaction(request, async tx => {
      const members = await tx.select({ id: employees.id }).from(employeeDepartments)
        .innerJoin(employees, eq(employees.id, employeeDepartments.employeeId))
        .where(and(eq(employeeDepartments.departmentId, id), eq(employees.isActive, true))).limit(1);
      if (members.length) throw new AccountError(409, 'Сначала переведите активных сотрудников в другие отделы');
      const [department] = await tx.update(departments).set({ isActive: false }).where(eq(departments.id, id)).returning();
      if (!department) throw new AccountError(404, 'Отдел не найден');
      return { ok: true };
    });
  });
  app.get('/admin/employees', { preHandler: admin }, async () => ({
    employees: (await database().select().from(employees).orderBy(employees.displayName)).map(employeeDto),
    memberships: await database().select().from(employeeDepartments),
  }));
  app.post('/admin/employees', { preHandler: adminWrite, bodyLimit: 16384 }, async (request, reply) => {
    const input = parse(personInput, request.body);
    const passwordHash = await hashPassword(input.password);
    const created = await adminTransaction(request, async tx => {
      const [person] = await tx.insert(employees).values({ login: input.login, displayName: input.displayName,
        role: input.role, passwordHash, mustChangePassword: false }).returning();
      await setDepartments(tx, person.id, input.departmentIds, input.primaryDepartmentId);
      return employeeDto(person);
    });
    return reply.code(201).send(created);
  });
  app.patch<{ Params: { id: string } }>('/admin/employees/:id', { preHandler: adminWrite, bodyLimit: 16384 }, async request => {
    const id = parseId(request.params.id);
    const input = parse(personUpdate, request.body);
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return adminTransaction(request, async tx => {
      const [previous] = await tx.select().from(employees).where(eq(employees.id, id));
      if (!previous) throw new AccountError(404, 'Сотрудник не найден');
      if (input.role !== previous.role) throw new AccountError(403, 'Администраторы создаются только отдельной командой из env');
      if (previous.role === 'admin' && previous.isActive && (!input.isActive || input.role !== 'admin')) {
        const admins = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.role, 'admin'), eq(employees.isActive, true)));
        if (admins.length <= 1 || request.actor!.employee.id === id) throw new AccountError(409, 'Нельзя отключить себя или последнего активного администратора');
      }
      const [person] = await tx.update(employees).set({ login: input.login, displayName: input.displayName,
        role: input.role, isActive: input.isActive, ...(passwordHash ? { passwordHash, mustChangePassword: false, failedLoginCount: 0, loginBlockedUntil: null } : {}) }).where(eq(employees.id, id)).returning();
      await setDepartments(tx, id, input.departmentIds, input.primaryDepartmentId);
      if (passwordHash || !input.isActive || previous.role !== input.role) {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.employeeId, id), isNull(sessions.revokedAt)));
      }
      return employeeDto(person);
    });
  });
};
