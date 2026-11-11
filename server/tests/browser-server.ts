// Test-only server: excluded from production Docker context and build.
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from '../src/db/index.js';
import type { Database } from '../src/plugins/database.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { hashPassword } from '../src/modules/accounts/security.js';

const pg = new PGlite();
const uploadDir = await mkdtemp(join(tmpdir(), 'stickerboard-browser-files-'));
const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
for (const entry of journal.entries) await pg.exec(readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
const db = drizzle(pg, { schema });
const fixture = JSON.parse(readFileSync(new URL('../../tests/browser-fixture.json', import.meta.url), 'utf8')) as {
  password: string;
  departments: { legacyId: string; id: string; boardId: string; name: string; code: string; color: string }[];
  employees: (schema.NewEmployee & { legacyId: string; departmentId: string })[];
};
interface SeedNote {
  id: string; boardId: string; authorId: string; text: string; x: number; y: number; rotation: number;
  parentId?: string; paperSeed?: number; read: boolean; done: boolean;
  attachment?: { name: string; kind: string };
}
const passwordHash = await hashPassword(fixture.password);
const legacyFastening = (style: string | undefined) => style === 'mint' ? 'clip' as const : style === 'pink' ? 'tape' as const : style === 'cream' ? 'fold' as const : 'pin' as const;
async function reset(notes: SeedNote[]) {
  for (const name of await readdir(uploadDir)) await unlink(join(uploadDir, name));
  await db.transaction(async tx => {
    await tx.delete(schema.notifications); await tx.delete(schema.attachments);
    await tx.delete(schema.stickerEmployeeRecipients); await tx.delete(schema.stickerDepartmentRecipients);
    await tx.delete(schema.stickers).where(sql`parent_id is not null`);
    await tx.delete(schema.stickers); await tx.delete(schema.sessions); await tx.delete(schema.employeeDepartments);
    await tx.delete(schema.employees); await tx.delete(schema.boards); await tx.delete(schema.departments);
    for (const department of fixture.departments) {
      if (department.legacyId !== 'general') await tx.insert(schema.departments).values({ id: department.id, name: department.name, code: department.code, color: department.color });
      await tx.insert(schema.boards).values({ id: department.boardId, name: department.name,
        departmentId: department.legacyId === 'general' ? null : department.id, isGeneral: department.legacyId === 'general' });
    }
    for (const person of fixture.employees) {
      await tx.insert(schema.employees).values({ id: person.id, login: person.login, displayName: person.displayName,
        avatarUrl: person.avatarUrl, paperStyle: person.paperStyle, fastening: legacyFastening(person.paperStyle), role: person.role, passwordHash, mustChangePassword: false });
      await tx.insert(schema.employeeDepartments).values({ employeeId: person.id!, departmentId: person.departmentId, isPrimary: true });
    }
    const ids = new Map(notes.map((note, index) => [note.id, '00000000-0000-4000-8000-' + String(index + 1001).padStart(12, '0')]));
    const orders = new Map<string, number>();
    for (const [index, note] of notes.entries()) {
      const author = fixture.employees.find(person => person.legacyId === note.authorId)!;
      const board = fixture.departments.find(department => department.legacyId === note.boardId)!;
      const replyOrder = note.parentId ? orders.get(note.parentId) ?? 0 : null;
      if (note.parentId) orders.set(note.parentId, replyOrder! + 1);
      const time = new Date(Date.now() - 3600000 + index);
      await tx.insert(schema.stickers).values({ id: ids.get(note.id)!, boardId: board.boardId, authorId: author.id!, authorDepartmentId: author.departmentId,
        text: note.text, x: note.x, y: note.y, rotation: note.rotation, paperSeed: ['anna-1', 'denis-1', 'elena-1', 'maxim-1'].includes(note.id)
          ? ['anna-1', 'denis-1', 'elena-1', 'maxim-1'].indexOf(note.id) : note.paperSeed!,
        paperStyle: author.paperStyle!, fastening: legacyFastening(author.paperStyle), parentId: note.parentId ? ids.get(note.parentId)! : null, replyOrder,
        zIndex: note.parentId ? 0 : index + 1, read: note.read, done: note.done, createdAt: time,
        readAt: note.read ? time : null, readById: note.read ? author.id! : null,
        doneAt: note.done ? time : null, doneById: note.done ? author.id! : null });
      if (board.legacyId !== 'general') await tx.insert(schema.stickerDepartmentRecipients).values({ stickerId: ids.get(note.id)!, departmentId: board.id });
      if (note.attachment) await tx.insert(schema.attachments).values({ stickerId: ids.get(note.id)!, originalName: note.attachment.name,
        mimeType: note.attachment.kind === 'image' ? 'image/png' : 'application/octet-stream', sizeBytes: 1024, storageKey: 'fixture/' + ids.get(note.id)! });
    }
  });
}
await reset([]);
const app = buildApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'warn', APP_ORIGIN: 'http://127.0.0.1:5174',
  UPLOAD_DIR: uploadDir,
  COOKIE_SECURE: 'false', TRUST_PROXY: 'one' }), { database: db as unknown as Database });
// Available only in this test program, bound to loopback. Never compiled/copied to production.
app.post<{ Body: { notes: SeedNote[] } }>('/__test/reset', async request => { await reset(request.body.notes); return { ok: true }; });
app.addHook('onClose', async () => {
  await pg.close();
  for (const name of await readdir(uploadDir)) await unlink(join(uploadDir, name));
  await rmdir(uploadDir);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
await app.listen({ host: '127.0.0.1', port: 3101 });
