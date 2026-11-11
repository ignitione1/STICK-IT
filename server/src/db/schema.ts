import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, doublePrecision, foreignKey, index, integer,
  pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';

export const employeeRole = pgEnum('employee_role', ['user', 'admin']);
export const paperStyle = pgEnum('paper_style', ['yellow', 'mint', 'pink', 'blue', 'cream', 'lavender', 'peach', 'sea', 'sage', 'berry']);
export const fastening = pgEnum('fastening', ['pin', 'clip', 'tape', 'fold']);
export const notificationType = pgEnum('notification_type', ['addressed_sticker', 'sticker_reply']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  .$onUpdateFn(() => sql`now()`);

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  login: varchar('login', { length: 128 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  avatarUrl: text('avatar_url'),
  avatarPhoto: text('avatar_photo'),
  role: employeeRole('role').notNull().default('user'),
  isActive: boolean('is_active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  loginBlockedUntil: timestamp('login_blocked_until', { withTimezone: true }),
  paperStyle: paperStyle('paper_style').notNull().default('yellow'),
  fastening: fastening('fastening').notNull().default('pin'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex('employees_login_ci_uidx').on(sql`lower(${table.login})`),
  check('employees_login_check', sql`length(btrim(${table.login})) > 0 AND ${table.login} = btrim(${table.login})`),
  check('employees_name_check', sql`length(btrim(${table.displayName})) > 0`),
  check('employees_password_hash_check', sql`length(btrim(${table.passwordHash})) > 0`),
  check('employees_updated_at_check', sql`${table.updatedAt} >= ${table.createdAt}`),
  check('employees_failed_login_count_check', sql`${table.failedLoginCount} >= 0`),
]);

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 64 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  unique('departments_code_unique').on(table.code),
  check('departments_code_check', sql`${table.code} ~ '^[a-z][a-z0-9_-]*$'`),
  check('departments_name_check', sql`length(btrim(${table.name})) > 0`),
  check('departments_color_check', sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  check('departments_updated_at_check', sql`${table.updatedAt} >= ${table.createdAt}`),
]);

export const employeeDepartments = pgTable('employee_departments', {
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
  isPrimary: boolean('is_primary').notNull().default(false),
}, table => [
  primaryKey({ columns: [table.employeeId, table.departmentId] }),
  uniqueIndex('employee_departments_primary_uidx').on(table.employeeId).where(sql`${table.isPrimary}`),
  index('employee_departments_department_idx').on(table.departmentId, table.employeeId),
]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: createdAt(),
}, table => [index('push_subscriptions_employee_idx').on(table.employeeId)]);

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
  isGeneral: boolean('is_general').notNull().default(false),
  createdAt: createdAt(),
}, table => [
  unique('boards_department_unique').on(table.departmentId),
  uniqueIndex('boards_general_uidx').on(table.isGeneral).where(sql`${table.isGeneral}`),
  check('boards_scope_check', sql`(${table.departmentId} IS NOT NULL AND NOT ${table.isGeneral}) OR (${table.departmentId} IS NULL AND ${table.isGeneral})`),
  check('boards_name_check', sql`length(btrim(${table.name})) > 0`),
]);

export const stickers = pgTable('stickers', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  authorDepartmentId: uuid('author_department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
  parentId: uuid('parent_id'),
  // All replies point to the root, matching the existing frontend model.
  // The computed root and composite FK forbid deeper replies and cycles.
  threadRootId: uuid('thread_root_id').notNull().generatedAlwaysAs(sql`coalesce("parent_id", "id")`),
  replyOrder: integer('reply_order'),
  text: text('text').notNull(),
  revision: integer('revision').notNull().default(0),
  // Absolute coordinates for roots; offsets from the root for replies.
  x: doublePrecision('x').notNull().default(0),
  y: doublePrecision('y').notNull().default(0),
  rotation: doublePrecision('rotation').notNull().default(0),
  zIndex: bigint('z_index', { mode: 'number' }).notNull().default(0),
  paperStyle: paperStyle('paper_style').notNull(),
  fastening: fastening('fastening').notNull().default('pin'),
  paperSeed: bigint('paper_seed', { mode: 'number' }).notNull(),
  read: boolean('read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  readById: uuid('read_by_id').references(() => employees.id, { onDelete: 'restrict' }),
  done: boolean('done').notNull().default(false),
  doneAt: timestamp('done_at', { withTimezone: true }),
  doneById: uuid('done_by_id').references(() => employees.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedById: uuid('archived_by_id').references(() => employees.id, { onDelete: 'restrict' }),
}, table => [
  unique('stickers_thread_identity_unique').on(table.id, table.boardId, table.threadRootId),
  foreignKey({
    name: 'stickers_parent_same_board_root_fk',
    columns: [table.parentId, table.boardId, table.threadRootId],
    foreignColumns: [table.id, table.boardId, table.threadRootId],
  }).onDelete('restrict').onUpdate('no action'),
  check('stickers_parent_not_self_check', sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
  check('stickers_reply_order_check', sql`(${table.parentId} IS NULL AND ${table.replyOrder} IS NULL) OR (${table.parentId} IS NOT NULL AND ${table.replyOrder} IS NOT NULL AND ${table.replyOrder} >= 0)`),
  uniqueIndex('stickers_reply_order_uidx').on(table.parentId, table.replyOrder).where(sql`${table.parentId} IS NOT NULL`),
  check('stickers_position_check', sql`${table.x} > '-Infinity'::float8 AND ${table.x} < 'Infinity'::float8 AND ${table.y} > '-Infinity'::float8 AND ${table.y} < 'Infinity'::float8`),
  check('stickers_rotation_check', sql`${table.rotation} BETWEEN -180 AND 180`),
  check('stickers_z_index_check', sql`${table.zIndex} BETWEEN 0 AND 9007199254740991 AND (${table.parentId} IS NULL OR ${table.zIndex} = 0)`),
  check('stickers_paper_seed_check', sql`${table.paperSeed} BETWEEN 0 AND 4294967295`),
  check('stickers_read_state_check', sql`(${table.read} AND ${table.readAt} IS NOT NULL AND ${table.readById} IS NOT NULL) OR (NOT ${table.read} AND ${table.readAt} IS NULL AND ${table.readById} IS NULL)`),
  check('stickers_done_state_check', sql`(${table.done} AND ${table.doneAt} IS NOT NULL AND ${table.doneById} IS NOT NULL) OR (NOT ${table.done} AND ${table.doneAt} IS NULL AND ${table.doneById} IS NULL)`),
  check('stickers_done_requires_read_check', sql`NOT ${table.done} OR ${table.read}`),
  check('stickers_archive_state_check', sql`(${table.archivedAt} IS NULL AND ${table.archivedById} IS NULL) OR (${table.archivedAt} IS NOT NULL AND ${table.archivedById} IS NOT NULL)`),
  check('stickers_updated_at_check', sql`${table.updatedAt} >= ${table.createdAt}`),
  check('stickers_revision_check', sql`${table.revision} >= 0`),
  index('stickers_board_active_roots_idx').on(table.boardId, table.zIndex, table.id)
    .where(sql`${table.parentId} IS NULL AND ${table.archivedAt} IS NULL`),
  index('stickers_thread_idx').on(table.threadRootId, table.replyOrder, table.id),
  index('stickers_board_created_idx').on(table.boardId, table.createdAt),
  index('stickers_author_created_idx').on(table.authorId, table.createdAt),
  index('stickers_author_department_created_idx').on(table.authorDepartmentId, table.createdAt),
  index('stickers_archived_at_idx').on(table.archivedAt, table.id).where(sql`${table.archivedAt} IS NOT NULL`),
  index('stickers_created_at_idx').on(table.createdAt, table.id),
  index('stickers_read_by_idx').on(table.readById).where(sql`${table.readById} IS NOT NULL`),
  index('stickers_done_by_idx').on(table.doneById).where(sql`${table.doneById} IS NOT NULL`),
  index('stickers_archived_by_idx').on(table.archivedById).where(sql`${table.archivedById} IS NOT NULL`),
]);

export const stickerEmployeeRecipients = pgTable('sticker_employee_recipients', {
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'restrict' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
}, table => [
  primaryKey({ columns: [table.stickerId, table.employeeId] }),
  index('sticker_employee_recipients_employee_idx').on(table.employeeId, table.stickerId),
]);

export const stickerDepartmentRecipients = pgTable('sticker_department_recipients', {
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'restrict' }),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
}, table => [
  primaryKey({ columns: [table.stickerId, table.departmentId] }),
  index('sticker_department_recipients_department_idx').on(table.departmentId, table.stickerId),
]);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'restrict' }),
  originalName: text('original_name').notNull(),
  mimeType: varchar('mime_type', { length: 255 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  contentHash: varchar('content_hash', { length: 64 }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('attachments_storage_key_unique').on(table.storageKey),
  check('attachments_size_check', sql`${table.sizeBytes} BETWEEN 0 AND 9007199254740991`),
  check('attachments_name_check', sql`length(btrim(${table.originalName})) > 0`),
  check('attachments_mime_check', sql`length(btrim(${table.mimeType})) > 0`),
  check('attachments_storage_key_check', sql`length(btrim(${table.storageKey})) > 0`),
  index('attachments_sticker_idx').on(table.stickerId, table.uploadedAt),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  type: notificationType('type').notNull(),
  stickerId: uuid('sticker_id').notNull().references(() => stickers.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, table => [
  unique('notifications_recipient_sticker_type_unique').on(table.recipientId, table.stickerId, table.type),
  check('notifications_read_at_check', sql`${table.readAt} IS NULL OR ${table.readAt} >= ${table.createdAt}`),
  index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt, table.id),
  index('notifications_unread_idx').on(table.recipientId, table.createdAt).where(sql`${table.readAt} IS NULL`),
  index('notifications_sticker_idx').on(table.stickerId),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => [
  unique('sessions_token_hash_unique').on(table.tokenHash),
  check('sessions_token_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check('sessions_expires_at_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('sessions_revoked_at_check', sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt}`),
  index('sessions_employee_idx').on(table.employeeId),
  index('sessions_expires_at_idx').on(table.expiresAt),
]);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type EmployeeDepartment = typeof employeeDepartments.$inferSelect;
export type NewEmployeeDepartment = typeof employeeDepartments.$inferInsert;
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type Sticker = typeof stickers.$inferSelect;
export type NewSticker = typeof stickers.$inferInsert;
export type StickerEmployeeRecipient = typeof stickerEmployeeRecipients.$inferSelect;
export type NewStickerEmployeeRecipient = typeof stickerEmployeeRecipients.$inferInsert;
export type StickerDepartmentRecipient = typeof stickerDepartmentRecipients.$inferSelect;
export type NewStickerDepartmentRecipient = typeof stickerDepartmentRecipients.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
