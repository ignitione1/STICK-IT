import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { hashPassword } from '../src/modules/accounts/security.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=', 'base64');
type Upload = { name: string; bytes: Buffer; mime?: string };
function multipart(draft: unknown, files: Upload[]) {
  const boundary = 'board-' + randomUUID();
  const chunks: Buffer[] = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="draft"\r\n\r\n${JSON.stringify(draft)}\r\n`)];
  for (const file of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.mime ?? 'application/octet-stream'}\r\n\r\n`), file.bytes, Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: 'multipart/form-data; boundary=' + boundary };
}

test('вложения: транзакционная публикация, защищённые скачивания, лимиты и очистка ошибок', { timeout: 60000 }, async () => {
  const pg = new PGlite();
  const uploadDir = await mkdtemp(join(tmpdir(), 'stickerboard-files-test-'));
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  const db = drizzle(pg, { schema });
  const [department] = await db.insert(schema.departments).values({ name: 'Отдел', code: 'files', color: '#123456' }).returning();
  const [board] = await db.insert(schema.boards).values({ name: 'Отдел', departmentId: department.id }).returning();
  const [author, colleague] = await db.insert(schema.employees).values(['sender', 'colleague'].map(login => ({ login, displayName: login, passwordHash: 'fixture' }))).returning();
  const hash = await hashPassword('Attachments-password-2026');
  await db.update(schema.employees).set({ passwordHash: hash });
  await db.insert(schema.employeeDepartments).values([author, colleague].map(person => ({ employeeId: person.id, departmentId: department.id, isPrimary: true })));
  const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', UPLOAD_DIR: uploadDir }), { database: db as unknown as Database });
  const origin = 'http://127.0.0.1:5173';
  async function login(name: string) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin, 'x-stickerboard-request': '1' }, payload: { login: name, password: 'Attachments-password-2026' } });
    assert.equal(response.statusCode, 200, response.body);
    return { cookie: String(response.headers['set-cookie']).split(';')[0], origin, 'x-stickerboard-request': '1', 'x-csrf-token': response.json().csrfToken };
  }
  try {
    const a = await login('sender'); const b = await login('colleague');
    const id = randomUUID();
    const draft = { id, boardId: board.id, text: 'Файлы коллегам' };
    const files: Upload[] = [{ name: 'photo.png', bytes: png }, { name: 'plan.md', bytes: Buffer.from('# План\nВстреча') }];
    const upload = async (data = draft, list = files, headers: Record<string, string> = a) => {
      const body = multipart(data, list);
      return app.inject({ method: 'POST', url: '/api/stickers/with-attachments', headers: { ...headers, 'content-type': body.contentType }, payload: body.payload });
    };
    assert.equal((await upload(draft, files, {})).statusCode, 401);
    assert.equal((await upload(draft, files, { ...a, origin: 'https://other.example' })).statusCode, 403);
    assert.equal((await upload(draft, files, { ...a, 'x-csrf-token': '' })).statusCode, 403);
    assert.equal((await upload()).statusCode, 201);
    assert.equal((await upload()).statusCode, 200);
    assert.equal((await readdir(uploadDir)).length, 2, 'повтор отправки не оставляет лишних файлов');
    const list = (await app.inject({ url: '/api/stickers', headers: b })).json();
    const note = list.notes[0];
    assert.equal(note.attachments.length, 2);
    assert.equal(JSON.stringify(list).includes('storageKey'), false);
    const image = note.attachments.find((file: { kind: string }) => file.kind === 'image');
    const document = note.attachments.find((file: { kind: string }) => file.kind === 'document');
    assert.equal((await app.inject('/api/attachments/' + image.id + '/preview')).statusCode, 401);
    const preview = await app.inject({ url: '/api/attachments/' + image.id + '/preview', headers: b });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.headers['content-type'], 'image/png');
    assert.match(String(preview.headers['content-disposition']), /^inline;/);
    assert.equal(preview.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(preview.rawPayload, png);
    const download = await app.inject({ url: '/api/attachments/' + document.id + '/download', headers: b });
    assert.equal(download.statusCode, 200);
    assert.match(String(download.headers['content-disposition']), /^attachment;/);
    assert.deepEqual(download.rawPayload, files[1].bytes);
    assert.equal((await app.inject({ url: '/api/attachments/' + document.id + '/preview', headers: b })).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/attachments/' + randomUUID() + '/download', headers: b })).statusCode, 404);
    const before = await readdir(uploadDir);
    for (const [bad, status] of [
      [[{ name: 'virus.exe', bytes: png }], 400],
      [[{ name: 'fake.png', bytes: Buffer.from('<svg/>') }], 400],
      [[{ name: 'large.txt', bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }], 413],
      [[files[0], { ...files[0], name: 'same-content.png' }], 400],
      [Array.from({ length: 6 }, (_, index) => ({ name: 'note.txt', bytes: Buffer.from('test' + index) })), 413],
      [Array.from({ length: 3 }, (_, index) => ({ name: 'note.txt', bytes: Buffer.alloc(9 * 1024 * 1024, index) })), 413],
    ] as [Upload[], number][]) {
      const response = await upload({ ...draft, id: randomUUID() }, bad);
      assert.equal(response.statusCode, status, response.body);
      assert.deepEqual(await readdir(uploadDir), before);
    }
    assert.equal((await upload({ ...draft, id: randomUUID(), boardId: randomUUID() })).statusCode, 404);
    assert.deepEqual(await readdir(uploadDir), before, 'ошибка БД убирает файлы');
    assert.equal((await db.select().from(schema.stickers)).length, 1);
    const rows = await db.select().from(schema.attachments);
    assert.deepEqual(await readFile(join(uploadDir, rows.find(file => file.mimeType === 'image/png')!.storageKey)), png);
    const replyId = randomUUID();
    const officeFiles: Upload[] = ['pdf', 'docx', 'xlsx', 'txt'].map(extension => ({ name: 'Документ.' + extension, bytes: Buffer.from('Original file bytes: ' + extension) }));
    const replyPayload = multipart({ id: replyId, parentId: id, boardId: board.id, text: 'Документы в ответе' }, officeFiles);
    const reply = await app.inject({ method: 'POST', url: '/api/stickers/with-attachments', headers: { ...b, 'content-type': replyPayload.contentType }, payload: replyPayload.payload });
    assert.equal(reply.statusCode, 201, reply.body);
    const officeRows = await db.select().from(schema.attachments).where(eq(schema.attachments.stickerId, replyId));
    assert.equal(officeRows.length, 4);
    for (const file of officeRows) {
      const response = await app.inject({ url: '/api/attachments/' + file.id + '/download', headers: a });
      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers['content-disposition']), /filename\*=UTF-8''%D0/);
      assert.deepEqual(response.rawPayload, officeFiles.find(item => item.name === file.originalName)!.bytes);
    }
    const replacement: Upload[] = [{ name: 'replacement.pdf', bytes: Buffer.from('Replacement PDF bytes') }];
    const edit = async (data: unknown, uploaded: Upload[] = replacement, headers: Record<string, string> = a) => {
      const body = multipart(data, uploaded);
      return app.inject({ method: 'POST', url: '/api/stickers/' + id + '/with-attachments', headers: { ...headers, 'content-type': body.contentType }, payload: body.payload });
    };
    const editDraft = { text: draft.text, revision: 0, keepAttachmentIds: [image.id] };
    assert.equal((await edit(editDraft, replacement, b)).statusCode, 403);
    await db.update(schema.employees).set({ role: 'admin' }).where(eq(schema.employees.id, colleague.id));
    assert.equal((await edit(editDraft, replacement, b)).statusCode, 403, 'администратор не редактирует чужие вложения');
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/stickers/' + id, headers: b, payload: { ...editDraft, keepAttachmentIds: [] } })).statusCode, 403);
    const savedBeforeEdit = await readdir(uploadDir);
    assert.equal((await edit({ ...editDraft, revision: 99 })).statusCode, 409);
    assert.equal((await edit({ ...editDraft, keepAttachmentIds: [officeRows[0].id] })).statusCode, 400);
    // Files uploaded before hashes were introduced are still checked by content.
    await db.update(schema.attachments).set({ contentHash: null }).where(eq(schema.attachments.id, image.id));
    assert.equal((await edit(editDraft, [{ name: 'renamed.png', bytes: png }])).statusCode, 400);
    assert.equal((await edit({ ...editDraft, keepAttachmentIds: [image.id, document.id] }, Array.from({ length: 4 }, (_, index) => ({ name: 'file.txt', bytes: Buffer.from('unique' + index) })))).statusCode, 413);
    assert.deepEqual(await readdir(uploadDir), savedBeforeEdit, 'ошибки редактирования не меняют старые файлы');
    const edited = await edit(editDraft);
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(edited.json().revision, 1);
    assert.equal((await app.inject({ url: '/api/attachments/' + document.id + '/download', headers: a })).statusCode, 404);
    const afterEdit = await db.select().from(schema.attachments).where(eq(schema.attachments.stickerId, id));
    assert.equal(afterEdit.length, 2);
    const removedDocument = rows.find(file => file.id === document.id)!;
    assert.equal((await readdir(uploadDir)).includes(removedDocument.storageKey), false);
    const newDocument = afterEdit.find(file => file.id !== image.id)!;
    const cleared = await app.inject({ method: 'PATCH', url: '/api/stickers/' + id, headers: a, payload: { text: draft.text, revision: 1, keepAttachmentIds: [image.id] } });
    assert.equal(cleared.statusCode, 200, cleared.body);
    assert.equal((await app.inject({ url: '/api/attachments/' + newDocument.id + '/download', headers: a })).statusCode, 404);
    assert.equal((await readdir(uploadDir)).includes(newDocument.storageKey), false);
    await app.inject({ method: 'PATCH', url: '/api/stickers/' + id + '/archive', headers: a, payload: { archived: true, revision: 2 } });
    assert.equal((await app.inject({ url: '/api/attachments/' + image.id + '/preview', headers: b })).statusCode, 200);
    await db.update(schema.attachments).set({ storageKey: '../outside' }).where(eq(schema.attachments.id, image.id));
    assert.equal((await app.inject({ url: '/api/attachments/' + image.id + '/download', headers: b })).statusCode, 404);
    await db.update(schema.attachments).set({ storageKey: rows.find(file => file.id === image.id)!.storageKey }).where(eq(schema.attachments.id, image.id));
    const purge = (headers: typeof a, notes: { id: string; revision: number }[]) => app.inject({ method: 'POST', url: '/api/stickers/archive/purge', headers, payload: { boardId: board.id, notes } });
    assert.equal((await purge(a, [{ id, revision: 3 }])).statusCode, 403);
    assert.equal((await purge(b, [{ id, revision: 3 }])).statusCode, 409, 'нельзя удалить корень без ответов');
    assert.equal((await purge(b, [{ id, revision: 2 }, { id: replyId, revision: 0 }])).statusCode, 409, 'устаревшая ревизия');
    assert.equal((await readdir(uploadDir)).length, 5);
    const deleted = await purge(b, [{ id, revision: 3 }, { id: replyId, revision: 0 }]);
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().deleted, 2);
    assert.deepEqual(await readdir(uploadDir), []);
    assert.equal((await db.select().from(schema.stickers)).length, 0);
    const secondRoot = randomUUID();
    const secondReply = randomUUID();
    assert.equal((await upload({ ...draft, id: secondRoot }, [files[0]])).statusCode, 201);
    const secondReplyBody = multipart({ id: secondReply, parentId: secondRoot, boardId: board.id, text: 'Отдельный ответ' }, [files[1]]);
    assert.equal((await app.inject({ method: 'POST', url: '/api/stickers/with-attachments', headers: { ...a, 'content-type': secondReplyBody.contentType }, payload: secondReplyBody.payload })).statusCode, 201);
    assert.equal((await purge(b, [{ id: secondRoot, revision: 0 }, { id: secondReply, revision: 0 }])).statusCode, 409, 'активные записки защищены');
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/stickers/' + secondReply + '/archive', headers: a, payload: { archived: true, revision: 0 } })).statusCode, 200);
    assert.equal((await purge(b, [{ id: secondReply, revision: 1 }])).statusCode, 200);
    assert.deepEqual((await db.select().from(schema.stickers)).map(note => note.id), [secondRoot]);
    assert.equal((await readdir(uploadDir)).length, 1, 'вложение активного оригинала сохранено');
    await db.update(schema.employees).set({ isActive: false }).where(eq(schema.employees.id, colleague.id));
    assert.equal((await app.inject({ url: '/api/attachments/' + document.id + '/download', headers: b })).statusCode, 401);
  } finally {
    await app.close(); await pg.close();
    for (const name of await readdir(uploadDir)) await rm(join(uploadDir, name), { force: true });
    await rmdir(uploadDir);
  }
});
