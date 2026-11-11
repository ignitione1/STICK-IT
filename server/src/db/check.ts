import { buildApp } from '../app.js';
import { loadEnv } from '../config/env.js';

async function check() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL не задана');
  const app = buildApp(env);
  try {
    await app.ready();
    console.log('PostgreSQL: подключение и SELECT 1 выполнены успешно');
  } finally {
    await app.close();
  }
}

check().catch(error => {
  console.error(error instanceof Error ? error.message : 'Ошибка проверки PostgreSQL');
  process.exitCode = 1;
});
