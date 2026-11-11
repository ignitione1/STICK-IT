import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async app => {
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' }));
};

export default healthRoutes;
