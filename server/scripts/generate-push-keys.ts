import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const directory = fileURLToPath(new URL('../../.local/', import.meta.url));
const path = fileURLToPath(new URL('../../.local/push-vapid.env', import.meta.url));
await mkdir(directory, { recursive: true });
const keys = webpush.generateVAPIDKeys();
try {
  await writeFile(path, `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Ключи записаны в .local/push-vapid.env. Перенесите их в защищённое окружение сервера.');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') console.error('Файл .local/push-vapid.env уже существует и не изменён.');
  else throw error;
  process.exitCode = 1;
}
