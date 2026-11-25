import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { bootstrapAdmin } from './modules/accounts/bootstrap.js';

async function main() {
  if (!process.stdin.isTTY) throw new Error('Запустите команду в интерактивном терминале');
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  let input: { login: string; displayName: string; password: string };
  try {
    const login = await reader.question('Логин администратора: ');
    const displayName = await reader.question('Отображаемое имя: ');
    process.stdout.write('Пароль (от 6 символов, ввод скрыт): ');
    hidden = true;
    const password = await reader.question('');
    hidden = false;
    process.stdout.write('\n');
    input = { login, displayName, password };
  } finally { reader.close(); }
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('Задайте DATABASE_URL и примените миграции');
  const app = buildApp(env);
  try {
    await app.ready();
    await bootstrapAdmin(app.db!, input);
    console.log('Администратор создан. Войдите через форму входа.');
  } finally { await app.close(); }
}
main().catch(() => {
  console.error('Не удалось создать администратора. Проверьте подключение, миграции, поля и отсутствие существующего администратора.');
  process.exitCode = 1;
});
