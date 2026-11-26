import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Env } from '../../config/env.js';
import { employees, sessions } from '../../db/schema.js';
import type { Employee } from '../../db/schema.js';
import { AccountError, csrfToken, equalToken, tokenHash } from './security.js';

export interface Actor { employee: Employee; sessionId: string; token: string }
declare module 'fastify' { interface FastifyRequest { actor: Actor | null } }
export function access(app: FastifyInstance, env: Env) {
  const database = () => {
    if (!app.db) throw new AccountError(503, 'База данных ещё не подключена');
    return app.db;
  };
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies.stickerboard_session;
    if (!token || !/^[\w-]{43}$/.test(token)) throw new AccountError(401, 'Войдите в Стикерборд');
    const [row] = await database().select({ employee: employees, sessionId: sessions.id, expiresAt: sessions.expiresAt }).from(sessions)
      .innerJoin(employees, eq(employees.id, sessions.employeeId)).where(and(
        eq(sessions.tokenHash, tokenHash(token)), isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()), eq(employees.isActive, true),
      ));
    if (!row) throw new AccountError(401, 'Сессия завершена. Войдите снова.');
    const now = Date.now();
    const lifetime = env.SESSION_HOURS * 3600000;
    // Avoid writing on every polling request while keeping the inactivity window close to its configured length.
    if (row.expiresAt.getTime() - now < lifetime - Math.min(3600000, lifetime / 4)) {
      const [renewed] = await database().update(sessions).set({ expiresAt: new Date(now + lifetime) }).where(and(
        eq(sessions.id, row.sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date(now)),
      )).returning({ id: sessions.id });
      if (!renewed) throw new AccountError(401, 'Сессия завершена. Войдите снова.');
      reply.setCookie('stickerboard_session', token, { path: '/api', httpOnly: true, sameSite: 'strict', secure: env.COOKIE_SECURE, maxAge: env.SESSION_HOURS * 3600 });
    }
    request.actor = { employee: row.employee, sessionId: row.sessionId, token };
  };
  const origin = async (request: FastifyRequest) => {
    if (request.headers.origin !== env.APP_ORIGIN || request.headers['x-stickerboard-request'] !== '1') throw new AccountError(403, 'Недопустимый источник запроса');
  };
  const write = async (request: FastifyRequest) => {
    await origin(request);
    if (!request.actor || !equalToken(request.headers['x-csrf-token'], csrfToken(request.actor.token))) throw new AccountError(403, 'Обновите страницу и повторите действие');
  };
  const admin = async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (request.actor?.employee.role !== 'admin') throw new AccountError(403, 'Доступно только администратору');
  };
  return { database, authenticate, origin, write, admin };
}
