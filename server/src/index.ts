import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main() {
  const env = loadEnv();
  const app = buildApp(env);
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'Остановка сервера');
    const deadline = setTimeout(() => {
      app.log.fatal('Превышено время остановки сервера');
      process.exit(1);
    }, 15000);
    deadline.unref();
    try {
      await app.close();
      app.log.info('Сервер остановлен, пул PostgreSQL закрыт');
    } catch {
      app.log.error('Ошибка остановки сервера');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error({ message: error instanceof Error ? error.message : 'Ошибка запуска' }, 'Сервер не запущен');
    await app.close();
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Не удалось запустить сервер');
  process.exitCode = 1;
});
