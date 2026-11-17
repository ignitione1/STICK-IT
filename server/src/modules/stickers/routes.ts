import { randomInt, randomUUID } from 'node:crypto';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { Database } from '../../plugins/database.js';
import { attachments, boards, departments, employeeDepartments, employees, notifications, stickers,
  stickerDepartmentRecipients, stickerEmployeeRecipients } from '../../db/schema.js';
import type { Sticker } from '../../db/schema.js';
import { access } from '../accounts/access.js';
import { AccountError } from '../accounts/security.js';
import { parse, parseId } from '../accounts/validation.js';
import { disposition, hashStoredFile, maxFileSize, maxFiles, maxTotalSize, openFile, receiveFiles, removeFiles } from './files.js';
import type { SavedFile } from './files.js';
import { sendNotePush } from '../push/routes.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const point = z.number().finite().min(-1000000).max(1000000);
const revision = z.number().int().min(0);
const editInput = z.object({ text: z.string().trim().min(1).max(2000), revision,
  keepAttachmentIds: z.array(z.string().uuid()).max(maxFiles).optional(),
}).strict();
const createInput = z.object({
  id: z.string().uuid().default(() => randomUUID()), boardId: z.string().uuid(), parentId: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(2000), x: point.default(80), y: point.default(100),
  rotation: z.number().finite().min(-180).max(180).default(-1.5),
  paperSeed: z.number().int().min(0).max(4294967295).default(() => randomInt(4294967296)),
  recipientEmployeeIds: z.array(z.string().uuid()).max(100).default([]),
  recipientDepartmentIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();
const failure = (status: number, message: string): never => { throw new AccountError(status, message); };

export const stickerRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(multipart, { limits: { fileSize: maxFileSize, files: maxFiles, fields: 1, fieldSize: 16384, parts: maxFiles + 1 } });
  const { database, authenticate, write } = access(app, env);
  const mutation = [authenticate, write];
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  async function activeBoard(tx: Transaction, id: string) {
    const [board] = await tx.select().from(boards).where(eq(boards.id, id)).for('update');
    if (!board) return failure(404, 'Доска не найдена');
    const [department] = board.departmentId ? await tx.select().from(departments).where(eq(departments.id, board.departmentId)) : [];
    return { board, active: board.isGeneral || department?.isActive === true };
  }
  async function withNote<T>(request: FastifyRequest, id: string, action: (tx: Transaction, note: Sticker, root: Sticker, active: boolean) => Promise<T>) {
    return database().transaction(async tx => {
      const [first] = await tx.select().from(stickers).where(eq(stickers.id, id));
      if (!first) return failure(404, 'Записка не найдена');
      const { active } = await activeBoard(tx, first.boardId);
      const [note] = await tx.select().from(stickers).where(eq(stickers.id, id)).for('update');
      const [root] = note.parentId ? await tx.select().from(stickers).where(eq(stickers.id, note.parentId)) : [note];
      if (!root) return failure(409, 'Связь ответов повреждена');
      // Every operation uses the authenticated employee; request bodies cannot set authors.
      if (!request.actor) return failure(401, 'Войдите в Стикерборд');
      return action(tx, note, root, active);
    });
  }
  const requireActive = (note: Sticker, root: Sticker, active: boolean) => {
    if (!active || note.archivedAt || root.archivedAt) failure(409, 'Записка находится в архиве');
  };
  const requireOwner = (request: FastifyRequest, note: Sticker) => {
    if (note.authorId !== request.actor!.employee.id) failure(403, 'Изменять текст и архивировать записку может только автор');
  };
  const requireRevision = (note: Sticker, expected: number) => {
    if (note.revision !== expected) failure(409, 'Записка уже изменилась. Обновите доску и откройте редактор заново.');
  };
  async function isRecipient(tx: Transaction, id: string, employeeId: string) {
    const personal = await tx.select().from(stickerEmployeeRecipients)
      .where(and(eq(stickerEmployeeRecipients.stickerId, id), eq(stickerEmployeeRecipients.employeeId, employeeId))).limit(1);
    if (personal.length) return true;
    const group = await tx.select({ id: stickerDepartmentRecipients.departmentId }).from(stickerDepartmentRecipients)
      .innerJoin(employeeDepartments, eq(employeeDepartments.departmentId, stickerDepartmentRecipients.departmentId))
      .where(and(eq(stickerDepartmentRecipients.stickerId, id), eq(employeeDepartments.employeeId, employeeId))).limit(1);
    return group.length > 0;
  }
  async function nextLayer(tx: Transaction, boardId: string) {
    const [row] = await tx.select({ max: sql<number>`coalesce(max(${stickers.zIndex}), 0)::float8` }).from(stickers)
      .where(and(eq(stickers.boardId, boardId), sql`${stickers.parentId} is null`));
    if (row.max >= Number.MAX_SAFE_INTEGER) return failure(409, 'Достигнут предел слоёв доски');
    return row.max + 1;
  }

  app.get('/stickers', { preHandler: authenticate }, async request => database().transaction(async tx => {
    const [notes, people, divisions, boardRows, personRecipients, groupRecipients, files, memberships] = await Promise.all([
      tx.select().from(stickers).orderBy(stickers.createdAt, stickers.id), tx.select().from(employees), tx.select().from(departments),
      tx.select().from(boards), tx.select().from(stickerEmployeeRecipients), tx.select().from(stickerDepartmentRecipients),
      tx.select().from(attachments), tx.select().from(employeeDepartments).where(eq(employeeDepartments.employeeId, request.actor!.employee.id)),
    ]);
    const peopleById = new Map(people.map(person => [person.id, person]));
    const departmentsById = new Map(divisions.map(department => [department.id, department]));
    const boardById = new Map(boardRows.map(board => [board.id, board]));
    const notesById = new Map(notes.map(note => [note.id, note]));
    const mine = request.actor!.employee.id;
    return { notes: notes.map(note => {
      const person = peopleById.get(note.authorId)!;
      const department = departmentsById.get(note.authorDepartmentId)!;
      const root = notesById.get(note.threadRootId)!;
      const board = boardById.get(note.boardId)!;
      const closedBoard = !!board.departmentId && !departmentsById.get(board.departmentId)?.isActive;
      const personal = personRecipients.filter(recipient => recipient.stickerId === note.id).map(recipient => recipient.employeeId);
      const groups = groupRecipients.filter(recipient => recipient.stickerId === note.id).map(recipient => recipient.departmentId);
      const recipient = personal.includes(mine) || memberships.some(member => groups.includes(member.departmentId));
      const archived = !!(note.archivedAt || root.archivedAt || closedBoard);
      const noteFiles = files.filter(attachment => attachment.stickerId === note.id).map(file => ({
        id: file.id, available: !file.storageKey.startsWith('fixture/'), sizeBytes: file.sizeBytes, contentHash: file.contentHash ?? undefined,
        name: file.originalName, caption: file.sizeBytes >= 1024 * 1024 ? `${(file.sizeBytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(file.sizeBytes / 1024)} КБ`,
        kind: file.mimeType.startsWith('image/') ? 'image' : 'document',
      }));
      const dates = [note.archivedAt, root.archivedAt].filter((date): date is Date => date !== null);
      return { id: note.id, boardId: note.boardId, authorId: note.authorId, authorDepartmentId: note.authorDepartmentId,
        text: note.text, x: note.x, y: note.y, rotation: note.rotation, paperSeed: note.paperSeed, preset: note.paperStyle, fastening: note.fastening,
        parentId: note.parentId ?? undefined, replyOrder: note.replyOrder, zIndex: note.zIndex, revision: note.revision,
        read: note.read, done: note.done, readAt: note.readAt, readById: note.readById, doneAt: note.doneAt, doneById: note.doneById,
        createdAt: note.createdAt, updatedAt: note.updatedAt, archivedAt: note.archivedAt, archivedById: note.archivedById,
        isArchived: archived, closedBoard, effectiveArchivedAt: dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null,
        recipientEmployeeIds: personal, recipientDepartmentIds: groups, isRecipient: recipient,
        canMark: !archived && (note.authorId === mine || recipient), canEdit: !archived && note.authorId === mine,
        canArchive: !archived && (note.authorId === mine || request.actor!.employee.role === 'admin'), canRestore: !!note.archivedAt && !closedBoard && (!note.parentId || !root.archivedAt) && note.authorId === mine,
        authorSnapshot: { id: person.id, name: person.displayName, label: `${person.displayName} (${department.name})`,
          department: department.id, avatar: person.avatarUrl ?? '', preset: note.paperStyle },
        departmentSnapshot: { id: department.id, name: department.name, color: department.color, stamp: department.name.toUpperCase() },
        attachments: noteFiles, attachment: noteFiles[0],
      };
    }) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' }));

  async function createNote(request: FastifyRequest, body: unknown, files: SavedFile[] = []) {
    const input = parse(createInput, body);
    const actor = request.actor!.employee;
    return database().transaction(async tx => {
      const { board, active } = await activeBoard(tx, input.boardId);
      if (!active) return failure(409, 'Отдел этой доски удалён');
      const [existing] = await tx.select().from(stickers).where(eq(stickers.id, input.id));
      if (existing) {
        if (existing.authorId !== actor.id || existing.boardId !== input.boardId || existing.text !== input.text) return failure(409, 'Идентификатор записки уже занят');
        return { id: existing.id, revision: existing.revision, created: false };
      }
      const memberships = await tx.select({ id: departments.id, primary: employeeDepartments.isPrimary }).from(employeeDepartments)
        .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
        .where(and(eq(employeeDepartments.employeeId, actor.id), eq(departments.isActive, true)));
      const origin = memberships.find(member => member.primary) ?? memberships[0];
      if (!origin) return failure(400, 'Администратор должен назначить вам активный отдел');
      let parentId: string | null = null;
      let replyToAuthorId: string | null = null;
      let replyOrder: number | null = null;
      if (input.parentId) {
        const [parent] = await tx.select().from(stickers).where(eq(stickers.id, input.parentId));
        if (!parent || parent.boardId !== input.boardId) return failure(400, 'Ответ должен находиться на доске исходной записки');
        const [root] = await tx.select().from(stickers).where(eq(stickers.id, parent.threadRootId));
        requireActive(parent, root, active);
        parentId = root.id;
        replyToAuthorId = parent.authorId;
        const [order] = await tx.select({ max: sql<number>`coalesce(max(${stickers.replyOrder}), -1)` }).from(stickers).where(eq(stickers.parentId, root.id));
        replyOrder = order.max + 1;
      }
      let personal = [...new Set(input.recipientEmployeeIds)];
      let groups = [...new Set(input.recipientDepartmentIds)];
      if (!personal.length && !groups.length) {
        if (replyToAuthorId) personal = [replyToAuthorId];
        else if (board.departmentId) groups = [board.departmentId];
        else personal = (await tx.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true))).map(person => person.id);
      }
      if (personal.length && (await tx.select().from(employees).where(and(inArray(employees.id, personal), eq(employees.isActive, true)))).length !== personal.length) return failure(400, 'Получатель не найден или заблокирован');
      if (groups.length && (await tx.select().from(departments).where(and(inArray(departments.id, groups), eq(departments.isActive, true)))).length !== groups.length) return failure(400, 'Отдел-получатель не найден или удалён');
      const [note] = await tx.insert(stickers).values({ id: input.id, boardId: input.boardId, authorId: actor.id, authorDepartmentId: origin.id,
        parentId, replyOrder, text: input.text, x: parentId ? 26 : input.x, y: parentId ? 0 : input.y,
        rotation: input.rotation, zIndex: parentId ? 0 : await nextLayer(tx, input.boardId), paperStyle: actor.paperStyle, fastening: actor.fastening, paperSeed: input.paperSeed }).returning();
      if (personal.length) await tx.insert(stickerEmployeeRecipients).values(personal.map(employeeId => ({ stickerId: note.id, employeeId })));
      if (groups.length) await tx.insert(stickerDepartmentRecipients).values(groups.map(departmentId => ({ stickerId: note.id, departmentId })));
      if (files.length) await tx.insert(attachments).values(files.map(file => ({ ...file, stickerId: note.id })));
      return { id: note.id, revision: note.revision, created: true };
    });
  }
  app.post('/stickers', { preHandler: mutation, bodyLimit: 16384 }, async (request, reply) => {
    const result = await createNote(request, request.body);
    if (result.created) void sendNotePush(database(), env, result.id).catch(() => app.log.warn('Не удалось отправить push-уведомления'));
    return reply.code(result.created ? 201 : 200).send(result);
  });
  app.post('/stickers/with-attachments', { preHandler: mutation }, async (request, reply) => {
    const saved: SavedFile[] = [];
    let committed = false;
    let result: Awaited<ReturnType<typeof createNote>>;
    try {
      const draft = await receiveFiles(request, env.UPLOAD_DIR, saved);
      result = await createNote(request, draft, saved);
      committed = result.created;
    } finally {
      if (!committed) await removeFiles(env.UPLOAD_DIR, saved);
    }
    if (result.created) void sendNotePush(database(), env, result.id).catch(() => app.log.warn('Не удалось отправить push-уведомления'));
    return reply.code(result.created ? 201 : 200).send(result);
  });
  app.get<{ Params: { id: string; action: string } }>('/attachments/:id/:action', { preHandler: authenticate }, async (request, reply) => {
    const { action } = request.params;
    if (!['preview', 'download'].includes(action)) return failure(404, 'Файл недоступен');
    const [file] = await database().select().from(attachments).where(eq(attachments.id, parseId(request.params.id)));
    if (!file) return failure(404, 'Файл недоступен');
    const preview = action === 'preview';
    if (preview && !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimeType)) return failure(400, 'Для этого файла доступно только скачивание');
    const { stream, size } = await openFile(env.UPLOAD_DIR, file.storageKey);
    return reply.header('Content-Disposition', disposition(file.originalName, preview))
      .header('Content-Length', size).header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .type(preview ? file.mimeType : 'application/octet-stream').send(stream);
  });

  async function editNote(request: FastifyRequest, id: string, body: unknown, files: SavedFile[] = []) {
    const input = parse(editInput, body);
    return withNote(request, id, async (tx, note, root, active) => {
      requireOwner(request, note); requireActive(note, root, active); requireRevision(note, input.revision);
      const existing = await tx.select().from(attachments).where(eq(attachments.stickerId, note.id));
      const keep = input.keepAttachmentIds ? [...new Set(input.keepAttachmentIds)] : existing.map(file => file.id);
      if (keep.some(id => !existing.some(file => file.id === id))) return failure(400, 'Вложение не принадлежит этой записке');
      const retained = existing.filter(file => keep.includes(file.id));
      if (retained.length + files.length > maxFiles || [...retained, ...files].reduce((total, file) => total + file.sizeBytes, 0) > maxTotalSize) return failure(413, 'До 5 файлов и до 25 МБ на записку');
      if (files.length) {
        const hashes = new Set<string>();
        for (const file of retained) {
          let hash = file.contentHash;
          if (!hash && /^[a-f0-9-]{36}\.bin$/.test(file.storageKey)) {
            try { hash = await hashStoredFile(env.UPLOAD_DIR, file.storageKey); }
            catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
            if (hash) await tx.update(attachments).set({ contentHash: hash }).where(eq(attachments.id, file.id));
          }
          if (hash) hashes.add(hash);
        }
        for (const file of files) {
          if (hashes.has(file.contentHash)) return failure(400, 'Один и тот же файл нельзя прикрепить несколько раз');
          hashes.add(file.contentHash);
        }
      }
      const removed = existing.filter(file => !keep.includes(file.id));
      if (removed.length) await tx.delete(attachments).where(inArray(attachments.id, removed.map(file => file.id)));
      if (files.length) await tx.insert(attachments).values(files.map(file => ({ ...file, stickerId: note.id })));
      const [updated] = await tx.update(stickers).set({ text: input.text, revision: note.revision + 1 }).where(eq(stickers.id, note.id)).returning();
      return { id: updated.id, revision: updated.revision, removed };
    });
  }
  async function removeOldFiles(files: { storageKey: string }[]) {
    try { await removeFiles(env.UPLOAD_DIR, files.filter(file => /^[a-f0-9-]{36}\.bin$/.test(file.storageKey))); }
    catch { app.log.warn({ count: files.length }, 'Не удалось очистить удалённые вложения'); }
  }
  app.post('/stickers/archive/purge', { preHandler: mutation }, async request => {
    if (request.actor!.employee.role !== 'admin') return failure(403, 'Доступно только администратору');
    const input = parse(z.object({ boardId: z.string().uuid(), notes: z.array(z.object({ id: z.string().uuid(), revision }).strict()).min(1).max(100) }).strict(), request.body);
    const expected = new Map(input.notes.map(note => [note.id, note.revision]));
    if (expected.size !== input.notes.length) return failure(400, 'Повторяются записки для удаления');
    const removed = await database().transaction(async tx => {
      const { active } = await activeBoard(tx, input.boardId);
      const boardNotes = await tx.select().from(stickers).where(eq(stickers.boardId, input.boardId)).for('update');
      const byId = new Map(boardNotes.map(note => [note.id, note]));
      const selected = input.notes.map(item => byId.get(item.id));
      if (selected.some(note => !note || note.revision !== expected.get(note.id))) return failure(409, 'Архив изменился. Обновите страницу и проверьте выбор заново');
      for (const note of selected) {
        if (!note) return failure(409, 'Записка не найдена');
        const root = note.parentId ? byId.get(note.parentId) : note;
        if (!root || (active && !note.archivedAt && !root.archivedAt)) return failure(409, 'Удалять можно только записки в архиве');
        if (!note.parentId && boardNotes.some(reply => reply.parentId === note.id && !expected.has(reply.id))) return failure(409, 'Состав переписки изменился. Обновите страницу и проверьте выбор заново');
      }
      const ids = [...expected.keys()];
      const files = await tx.select().from(attachments).where(inArray(attachments.stickerId, ids));
      await tx.delete(notifications).where(inArray(notifications.stickerId, ids));
      await tx.delete(stickerEmployeeRecipients).where(inArray(stickerEmployeeRecipients.stickerId, ids));
      await tx.delete(stickerDepartmentRecipients).where(inArray(stickerDepartmentRecipients.stickerId, ids));
      await tx.delete(attachments).where(inArray(attachments.stickerId, ids));
      const replies = selected.filter((note): note is Sticker => !!note?.parentId).map(note => note.id);
      const roots = selected.filter((note): note is Sticker => !!note && !note.parentId).map(note => note.id);
      if (replies.length) await tx.delete(stickers).where(inArray(stickers.id, replies));
      if (roots.length) await tx.delete(stickers).where(inArray(stickers.id, roots));
      return files;
    });
    try {
      await removeFiles(env.UPLOAD_DIR, removed.filter(file => /^[a-f0-9-]{36}\.bin$/.test(file.storageKey)));
      return { deleted: expected.size, filesRemoved: true };
    } catch {
      app.log.error({ count: removed.length }, 'Не удалось удалить файлы очищенного архива');
      return { deleted: expected.size, filesRemoved: false };
    }
  });
  app.patch<{ Params: { id: string } }>('/stickers/:id', { preHandler: mutation }, async request => {
    const { removed, ...result } = await editNote(request, parseId(request.params.id), request.body);
    await removeOldFiles(removed);
    return result;
  });
  app.post<{ Params: { id: string } }>('/stickers/:id/with-attachments', { preHandler: mutation }, async request => {
    const id = parseId(request.params.id);
    // Reject other authors before reading or saving uploaded files.
    await withNote(request, id, async (_tx, note, root, active) => { requireOwner(request, note); requireActive(note, root, active); });
    const saved: SavedFile[] = [];
    let committed = false;
    let result: Awaited<ReturnType<typeof editNote>>;
    try {
      const draft = await receiveFiles(request, env.UPLOAD_DIR, saved, false);
      result = await editNote(request, id, draft, saved);
      committed = true;
    } finally { if (!committed) await removeFiles(env.UPLOAD_DIR, saved); }
    const { removed, ...response } = result;
    await removeOldFiles(removed);
    return response;
  });
  app.patch<{ Params: { id: string } }>('/stickers/:id/marks', { preHandler: mutation }, async request => {
    const input = parse(z.object({ read: z.boolean().optional(), done: z.boolean().optional(), revision }).strict()
      .refine(value => value.read !== undefined || value.done !== undefined), request.body);
    return withNote(request, parseId(request.params.id), async (tx, note, root, active) => {
      requireActive(note, root, active); requireRevision(note, input.revision);
      const actorId = request.actor!.employee.id;
      if (note.authorId !== actorId && !await isRecipient(tx, note.id, actorId)) return failure(403, 'Отметки меняет только автор или адресат');
      const read = input.read ?? note.read;
      const done = !read ? false : input.done ?? note.done;
      if (input.done === true && !read) return failure(409, 'Сначала установите отметку «Прочитано»');
      const now = new Date();
      const [updated] = await tx.update(stickers).set({ read, done,
        readAt: read ? note.read ? note.readAt : now : null, readById: read ? note.read ? note.readById : actorId : null,
        doneAt: done ? note.done ? note.doneAt : now : null, doneById: done ? note.done ? note.doneById : actorId : null,
        revision: note.revision + 1 }).where(eq(stickers.id, note.id)).returning();
      return { id: updated.id, revision: updated.revision };
    });
  });
  app.patch<{ Params: { id: string } }>('/stickers/:id/position', { preHandler: mutation }, async request => {
    const input = parse(z.object({ x: point, y: point }).strict(), request.body);
    return withNote(request, parseId(request.params.id), async (tx, note, root, active) => {
      requireActive(note, root, active);
      if (note.parentId) return failure(400, 'Перемещайте основную записку вместе с ответами');
      await tx.update(stickers).set({ x: input.x, y: input.y, zIndex: await nextLayer(tx, note.boardId) }).where(eq(stickers.id, note.id));
      return { ok: true };
    });
  });
  app.post<{ Params: { id: string } }>('/stickers/:id/raise', { preHandler: mutation }, async request => withNote(request, parseId(request.params.id), async (tx, note, root, active) => {
    requireActive(note, root, active);
    await tx.update(stickers).set({ zIndex: await nextLayer(tx, root.boardId) }).where(eq(stickers.id, root.id));
    return { ok: true };
  }));
  app.patch<{ Params: { id: string } }>('/stickers/:id/archive', { preHandler: mutation }, async request => {
    const input = parse(z.object({ archived: z.boolean(), revision }).strict(), request.body);
    return withNote(request, parseId(request.params.id), async (tx, note, root, active) => {
      if (!input.archived || request.actor!.employee.role !== 'admin') requireOwner(request, note);
      requireRevision(note, input.revision);
      if (!input.archived && !active) return failure(409, 'Нельзя вернуть записку на доску удалённого отдела');
      if (!input.archived && note.parentId && root.archivedAt) return failure(409, 'Сначала автор должен вернуть основную записку из архива');
      await tx.update(stickers).set({ archivedAt: input.archived ? note.archivedAt ?? new Date() : null,
        archivedById: input.archived ? request.actor!.employee.id : null, revision: note.revision + 1 }).where(eq(stickers.id, note.id));
      return { ok: true };
    });
  });
};
