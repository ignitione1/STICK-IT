import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/index.js';

const db = drizzle.mock({ schema });

test('все связи Drizzle разрешаются без неоднозначных внешних ключей', () => {
  // Only compile SQL: no connection and no employee/sticker fixtures are created.
  const queries = [
    db.query.employees.findMany({ with: {
      departments: { with: { department: true } }, authoredStickers: true,
      readStickers: true, doneStickers: true, archivedStickers: true,
      receivedStickers: true, notifications: true, sessions: true,
    } }),
    db.query.departments.findMany({ with: {
      board: true, employees: { with: { employee: true } },
      originatedStickers: true, receivedStickers: true,
    } }),
    db.query.boards.findMany({ with: { department: true, stickers: true } }),
    db.query.stickers.findMany({ with: {
      author: true, authorDepartment: true, board: true,
      parent: true, replies: { with: { parent: true } },
      readBy: true, doneBy: true, archivedBy: true,
      employeeRecipients: { with: { employee: true, sticker: true } },
      departmentRecipients: { with: { department: true, sticker: true } },
      attachments: { with: { sticker: true } },
      notifications: { with: { recipient: true, sticker: true } },
    } }),
    db.query.sessions.findMany({ with: { employee: true } }),
  ];
  for (const query of queries) assert.match(query.toSQL().sql, /^select /);
});

test('генерируемый корень не записывается при создании стикера', () => {
  const note: schema.NewSticker = {
    boardId: '00000000-0000-4000-8000-000000000001',
    authorId: '00000000-0000-4000-8000-000000000002',
    authorDepartmentId: '00000000-0000-4000-8000-000000000003',
    text: 'Проверка SQL без сохранения в БД', paperStyle: 'mint', paperSeed: 4294967295,
  };
  // A generated column is not part of the insert type or emitted INSERT.
  type RootIsGenerated = 'threadRootId' extends keyof schema.NewSticker ? false : true;
  const rootIsGenerated: RootIsGenerated = true;
  assert.ok(rootIsGenerated);
  const query = db.insert(schema.stickers).values(note).toSQL();
  assert.ok(!query.sql.includes('"thread_root_id"'));
  assert.ok(query.params.includes(4294967295));
});

test('связи истории не используют каскадное удаление или обнуление', () => {
  const tables = [schema.employees, schema.departments, schema.employeeDepartments, schema.boards,
    schema.stickers, schema.stickerEmployeeRecipients, schema.stickerDepartmentRecipients,
    schema.attachments, schema.notifications, schema.sessions];
  for (const table of tables) {
    for (const fk of getTableConfig(table).foreignKeys) assert.equal(fk.onDelete, 'restrict', fk.getName());
  }
  const parent = getTableConfig(schema.stickers).foreignKeys
    .find(fk => fk.getName() === 'stickers_parent_same_board_root_fk');
  assert.ok(parent);
  assert.deepEqual(parent.reference().columns.map(column => column.name), ['parent_id', 'board_id', 'thread_root_id']);
  assert.deepEqual(parent.reference().foreignColumns.map(column => column.name), ['id', 'board_id', 'thread_root_id']);
});

test('первая миграция согласована с журналом и не удаляет данные', () => {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  assert.ok(journal.entries.length >= 1);
  const migration = readFileSync(new URL(`../drizzle/${journal.entries[0].tag}.sql`, import.meta.url), 'utf8');
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 10);
  assert.equal((migration.match(/CREATE TYPE /g) ?? []).length, 3);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b|\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT)\b/im);
  assert.match(migration, /GENERATED ALWAYS AS \(coalesce\("parent_id", "id"\)\) STORED/);
  assert.match(migration, /CONSTRAINT "stickers_done_requires_read_check"/);
});
