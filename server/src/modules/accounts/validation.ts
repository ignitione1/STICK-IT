import { z } from 'zod';
import { avatars } from './catalog.js';
import { validAvatarPhoto } from './photo.js';
import { AccountError } from './security.js';

export const login = z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/, 'Логин: латинские буквы, цифры, точка, дефис или подчёркивание');
export const password = z.string().min(12).max(128);
export const personInput = z.object({
  login, displayName: z.string().trim().min(1).max(200), password,
  role: z.literal('user').default('user'),
  departmentIds: z.array(z.string().uuid()).min(1).max(30),
  primaryDepartmentId: z.string().uuid(),
}).strict();
export const personUpdate = personInput.omit({ password: true }).extend({
  role: z.enum(['user', 'admin']),
  password: password.optional(), isActive: z.boolean(),
}).strict();
export const departmentInput = z.object({
  name: z.string().trim().min(1).max(200), code: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();
export const profileInput = z.object({
  avatarId: z.string().refine(value => avatars.some(avatar => avatar.id === value)).optional(),
  avatarPhoto: z.string().max(175000).refine(validAvatarPhoto).optional(),
  paperStyle: z.enum(['yellow', 'mint', 'pink', 'blue', 'cream', 'lavender', 'peach', 'sea', 'sage', 'berry']),
  fastening: z.enum(['pin', 'clip', 'tape', 'fold']).optional(),
}).strict().refine(value => !(value.avatarId && value.avatarPhoto));
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccountError(400, 'Проверьте поля формы. Пароль — от 12 до 128 символов; у сотрудника должен быть основной отдел.');
  return result.data;
}
export const parseId = (value: unknown) => parse(z.string().uuid(), value);
