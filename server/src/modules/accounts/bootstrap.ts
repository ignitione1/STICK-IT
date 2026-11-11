import { sql, eq } from 'drizzle-orm';
import type { Database } from '../../plugins/database.js';
import { boards, employees } from '../../db/schema.js';
import { hashPassword, AccountError } from './security.js';
import { login, password, parse } from './validation.js';
import { z } from 'zod';

export async function bootstrapAdmin(db: Database, input: unknown) {
  const values = parse(z.object({ login, password, displayName: z.string().trim().min(1).max(200) }).strict(), input);
  const passwordHash = await hashPassword(values.password);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(73194210)`);
    const existing = await tx.select({ id: employees.id }).from(employees).where(eq(employees.role, 'admin')).limit(1);
    if (existing.length) throw new AccountError(409, 'Администратор уже существует. Используйте админку.');
    await tx.insert(boards).values({ name: 'Общая доска', isGeneral: true }).onConflictDoNothing();
    const [created] = await tx.insert(employees).values({ login: values.login, displayName: values.displayName,
      passwordHash, role: 'admin', mustChangePassword: false }).returning({ id: employees.id });
    return created;
  });
}
