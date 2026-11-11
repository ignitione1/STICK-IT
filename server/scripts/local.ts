import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';
import { createServer } from 'vite';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { openLocalDatabase } from './local-database.js';

if (process.env.NODE_ENV === 'production') throw new Error('Локальный стенд недоступен в production');
const origin = 'http://127.0.0.1:5175';
const local = await openLocalDatabase(
  fileURLToPath(new URL('../../.local/manual/', import.meta.url)),
  fileURLToPath(new URL('../drizzle/', import.meta.url)),
);
const pushKeysPath = fileURLToPath(new URL('../../.local/manual/push-keys.json', import.meta.url));
try { await writeFile(pushKeysPath, JSON.stringify(webpush.generateVAPIDKeys()), { flag: 'wx', mode: 0o600 }); }
catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
const pushKeys = JSON.parse(await readFile(pushKeysPath, 'utf8')) as { publicKey: string; privateKey: string };
const app = buildApp(parseEnv({ NODE_ENV: 'development', LOG_LEVEL: 'warn',
  UPLOAD_DIR: fileURLToPath(new URL('../../.local/manual/uploads/', import.meta.url)),
  APP_ORIGIN: origin, COOKIE_SECURE: 'false', TRUST_PROXY: 'none', VAPID_PUBLIC_KEY: pushKeys.publicKey, VAPID_PRIVATE_KEY: pushKeys.privateKey }), { database: local.database });
app.addHook('onClose', async () => { await local.close(); });
let frontend: Awaited<ReturnType<typeof createServer>> | undefined;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await frontend?.close();
  await app.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close(); });
try {
  await app.listen({ host: '127.0.0.1', port: 3102 });
  frontend = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: false,
    plugins: [(await import('@vitejs/plugin-react')).default()],
    server: { host: '127.0.0.1', port: 5175, strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:3102' } },
  });
  await frontend.listen();
  console.log(`Локальный стенд: ${origin}`);
  console.log(`Логины и пароли двух администраторов: ${local.credentialsPath}`);
  console.log('Данные сохраняются в .local/manual/postgres. Остановка: Ctrl+C.');
} catch {
  await close();
  console.error('Не удалось запустить локальный стенд. Проверьте, свободны ли порты 3102/5175 и не запущена ли другая копия стенда.');
  process.exitCode = 1;
}
