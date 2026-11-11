import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { bootstrapAdminsFromEnv } from './modules/accounts/bootstrap-env.js';

const env = loadEnv();
const app = buildApp(env);
try {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL не задана');
  await app.ready();
  const result = await bootstrapAdminsFromEnv(app.db!, process.env);
  console.log(`Администраторы: создано ${result.created}, оставлено без изменений ${result.unchanged}`);
} catch {
  console.error('Не удалось создать администраторов. Проверьте миграции, шесть BOOTSTRAP_ADMIN_* переменных и занятые логины. Пароли существующих аккаунтов не изменяются.');
  process.exitCode = 1;
} finally { await app.close(); }
