import type { FastifyInstance, FastifyRequest } from 'fastify';
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
  const authenticate = async (request: FastifyRequest) => {
    const token = request.cookies.stickerboard_session;
    if (!token || !/^[\w-]{43}$/.test(token)) throw new AccountError(401, 'Войдите в Стикерборд');
    const [row] = await database().select({ employee: employees, sessionId: sessions.id }).from(sessions)
      .innerJoin(employees, eq(employees.id, sessions.employeeId)).where(and(
        eq(sessions.tokenHash, tokenHash(token)), isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()), eq(employees.isActive, true),
      ));
    if (!row) throw new AccountError(401, 'Сессия завершена. Войдите снова.');
    request.actor = { ...row, token };
  };
  const origin = async (request: FastifyRequest) => {
    if (request.headers.origin !== env.APP_ORIGIN || request.headers['x-stickerboard-request'] !== '1') throw new AccountError(403, 'Недопустимый источник запроса');
  };
  const write = async (request: FastifyRequest) => {
    await origin(request);
    if (!request.actor || !equalToken(request.headers['x-csrf-token'], csrfToken(request.actor.token))) throw new AccountError(403, 'Обновите страницу и повторите действие');
  };
  const admin = async (request: FastifyRequest) => {
    await authenticate(request);
    if (request.actor?.employee.role !== 'admin') throw new AccountError(403, 'Доступно только администратору');
  };
  return { database, authenticate, origin, write, admin };
}
