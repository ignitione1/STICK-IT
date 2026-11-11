import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import type { Env } from './config/env.js';
import database from './plugins/database.js';
import healthRoutes from './modules/health/routes.js';
import { accountRoutes } from './modules/accounts/routes.js';
import { stickerRoutes } from './modules/stickers/routes.js';
import { pushRoutes } from './modules/push/routes.js';
import { AccountError } from './modules/accounts/security.js';
import type { Database } from './plugins/database.js';

export function buildApp(env: Env, options: { database?: Database } = {}) {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY === 'one' ? (_address: string, hop: number) => hop === 0 : false,
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    // Avoid logging query strings, which may later contain sensitive values.
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook('onResponse', async (request, reply) => {
    app.log.info({ requestId: request.id, method: request.method, route: request.routeOptions.url,
      statusCode: reply.statusCode, responseTime: reply.elapsedTime }, 'HTTP-запрос');
  });
  app.setErrorHandler((error, request, reply) => {
    const candidate = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const statusCode = typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
    request.log.error({ requestId: request.id, statusCode }, 'Ошибка обработки запроса');
    const cause = error instanceof Error && 'cause' in error ? error.cause : error;
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505') {
      return reply.code(409).send({ error: 'Такой логин или код отдела уже используется' });
    }
    reply.code(statusCode).send({ error: error instanceof AccountError ? error.message : statusCode === 500 ? 'Внутренняя ошибка сервера' : 'Некорректный запрос' });
  });
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Маршрут не найден' });
  });
  if (options.database) app.decorate('db', options.database);
  else app.register(database, { env });
  app.decorateRequest('actor', null);
  app.register(cookie);
  app.register(healthRoutes, { prefix: '/api' });
  app.register(accountRoutes, { prefix: '/api', env });
  app.register(stickerRoutes, { prefix: '/api', env });
  app.register(pushRoutes, { prefix: '/api', env });
  return app;
}
