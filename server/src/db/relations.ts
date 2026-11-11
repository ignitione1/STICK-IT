import { relations } from 'drizzle-orm';
import {
  attachments, boards, departments, employeeDepartments, employees, notifications,
  sessions, stickerDepartmentRecipients, stickerEmployeeRecipients, stickers,
} from './schema.js';

export const employeesRelations = relations(employees, ({ many }) => ({
  departments: many(employeeDepartments),
  authoredStickers: many(stickers, { relationName: 'stickerAuthor' }),
  readStickers: many(stickers, { relationName: 'stickerReadBy' }),
  doneStickers: many(stickers, { relationName: 'stickerDoneBy' }),
  archivedStickers: many(stickers, { relationName: 'stickerArchivedBy' }),
  receivedStickers: many(stickerEmployeeRecipients),
  notifications: many(notifications),
  sessions: many(sessions),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  employees: many(employeeDepartments),
  board: one(boards),
  originatedStickers: many(stickers),
  receivedStickers: many(stickerDepartmentRecipients),
}));

export const employeeDepartmentsRelations = relations(employeeDepartments, ({ one }) => ({
  employee: one(employees, { fields: [employeeDepartments.employeeId], references: [employees.id] }),
  department: one(departments, { fields: [employeeDepartments.departmentId], references: [departments.id] }),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  department: one(departments, { fields: [boards.departmentId], references: [departments.id] }),
  stickers: many(stickers),
}));

export const stickersRelations = relations(stickers, ({ one, many }) => ({
  board: one(boards, { fields: [stickers.boardId], references: [boards.id] }),
  author: one(employees, { fields: [stickers.authorId], references: [employees.id], relationName: 'stickerAuthor' }),
  authorDepartment: one(departments, { fields: [stickers.authorDepartmentId], references: [departments.id] }),
  parent: one(stickers, { fields: [stickers.parentId], references: [stickers.id], relationName: 'stickerReplies' }),
  replies: many(stickers, { relationName: 'stickerReplies' }),
  readBy: one(employees, { fields: [stickers.readById], references: [employees.id], relationName: 'stickerReadBy' }),
  doneBy: one(employees, { fields: [stickers.doneById], references: [employees.id], relationName: 'stickerDoneBy' }),
  archivedBy: one(employees, { fields: [stickers.archivedById], references: [employees.id], relationName: 'stickerArchivedBy' }),
  employeeRecipients: many(stickerEmployeeRecipients),
  departmentRecipients: many(stickerDepartmentRecipients),
  attachments: many(attachments),
  notifications: many(notifications),
}));

export const stickerEmployeeRecipientsRelations = relations(stickerEmployeeRecipients, ({ one }) => ({
  sticker: one(stickers, { fields: [stickerEmployeeRecipients.stickerId], references: [stickers.id] }),
  employee: one(employees, { fields: [stickerEmployeeRecipients.employeeId], references: [employees.id] }),
}));

export const stickerDepartmentRecipientsRelations = relations(stickerDepartmentRecipients, ({ one }) => ({
  sticker: one(stickers, { fields: [stickerDepartmentRecipients.stickerId], references: [stickers.id] }),
  department: one(departments, { fields: [stickerDepartmentRecipients.departmentId], references: [departments.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  sticker: one(stickers, { fields: [attachments.stickerId], references: [stickers.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(employees, { fields: [notifications.recipientId], references: [employees.id] }),
  sticker: one(stickers, { fields: [notifications.stickerId], references: [stickers.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  employee: one(employees, { fields: [sessions.employeeId], references: [employees.id] }),
}));
