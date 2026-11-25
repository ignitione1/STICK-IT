import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { boards, employees } from '../../db/schema.js';
import type { Database } from '../../plugins/database.js';
import { login, password } from './validation.js';
import { AccountError, hashPassword } from './security.js';

export async function bootstrapAdminsFromEnv(db: Database, input: NodeJS.ProcessEnv) {
  const schema = z.object({ login, displayName: z.string().trim().min(1).max(200), password: z.string().optional() });
  const configs = [1, 2].map(index => schema.safeParse({
    login: input[`BOOTSTRAP_ADMIN_${index}_LOGIN`], displayName: input[`BOOTSTRAP_ADMIN_${index}_NAME`], password: input[`BOOTSTRAP_ADMIN_${index}_PASSWORD`] || undefined,
  }));
  if (configs.some(result => !result.success)) throw new AccountError(400, 'Заполните LOGIN, NAME и PASSWORD для обоих BOOTSTRAP_ADMIN в env');
  const people = configs.map(result => result.data!);
  if (people[0].login === people[1].login) throw new AccountError(400, 'Логины двух администраторов должны различаться');
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(73194210)`);
    const existing = await tx.select().from(employees);
    const pending = people.filter(person => {
      const found = existing.find(employee => employee.login.toLowerCase() === person.login);
      if (found && found.role !== 'admin') throw new AccountError(409, 'Один из логинов уже занят сотрудником; повышения роли не будет');
      return !found;
    });
    if (existing.filter(employee => employee.role === 'admin').length + pending.length > 2) throw new AccountError(409, 'В базе уже есть другие администраторы. Проверьте логины в env');
    if (pending.some(person => !password.safeParse(person.password).success)) throw new AccountError(400, 'Для новых администраторов нужны пароли от 6 до 128 символов');
    for (const person of pending) await tx.insert(employees).values({ login: person.login, displayName: person.displayName,
      passwordHash: await hashPassword(person.password!), role: 'admin', mustChangePassword: false });
    if (!(await tx.select().from(boards).where(eq(boards.isGeneral, true)).limit(1)).length) await tx.insert(boards).values({ name: 'Общая доска', isGeneral: true });
    return { created: pending.length, unchanged: 2 - pending.length };
  });
}
