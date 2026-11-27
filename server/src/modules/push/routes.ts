import type { FastifyPluginAsync } from 'fastify';
import { and, eq, gt, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import webpush from 'web-push';
import type { Env } from '../../config/env.js';
import type { Database } from '../../plugins/database.js';
import { employees, employeeDepartments, pushSubscriptions, sessions, stickerDepartmentRecipients, stickerEmployeeRecipients, stickers } from '../../db/schema.js';
import { access } from '../accounts/access.js';
import { parse } from '../accounts/validation.js';
import { AccountError } from '../accounts/security.js';

const endpoint = z.string().max(2048).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(url.hostname) || url.hostname.endsWith('.notify.windows.com'));
});
const subscription = z.object({ endpoint, keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }).strict() }).strict();
const deliveryStatus = new Map<string, { result: 'accepted' | 'failed'; code?: string; at: string }>();
export const pushRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const { database, authenticate, write } = access(app, env);
  app.get('/push/config', { preHandler: authenticate }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { publicKey: env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : '' };
  });
  app.get('/push/status', { preHandler: authenticate }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const employeeId = request.actor!.employee.id;
    const rows = await database().select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)
      .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
      .where(and(eq(pushSubscriptions.employeeId, employeeId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    return { activeSubscriptions: rows.length, latestDelivery: deliveryStatus.get(employeeId) ?? null };
  });
  app.post('/push/subscription', { preHandler: [authenticate, write] }, async request => {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new AccountError(503, 'Уведомления на сервере ещё не настроены');
    const value = parse(subscription, request.body);
    const row = { endpoint: value.endpoint, employeeId: request.actor!.employee.id, sessionId: request.actor!.sessionId, p256dh: value.keys.p256dh, auth: value.keys.auth };
    await database().insert(pushSubscriptions).values(row).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row });
    return { ok: true };
  });
  app.delete('/push/subscription', { preHandler: [authenticate, write] }, async request => {
    const value = parse(z.object({ endpoint }).strict(), request.body);
    await database().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, value.endpoint), eq(pushSubscriptions.employeeId, request.actor!.employee.id)));
    return { ok: true };
  });
};

export async function sendNotePush(db: Database, env: Env, id: string, send: typeof webpush.sendNotification = webpush.sendNotification) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const [note] = await db.select().from(stickers).where(eq(stickers.id, id));
  if (!note) return;
  const [individuals, groups] = await Promise.all([
    db.select({ id: stickerEmployeeRecipients.employeeId }).from(stickerEmployeeRecipients).where(eq(stickerEmployeeRecipients.stickerId, id)),
    db.select({ id: employeeDepartments.employeeId }).from(stickerDepartmentRecipients).innerJoin(employeeDepartments, eq(employeeDepartments.departmentId, stickerDepartmentRecipients.departmentId)).where(eq(stickerDepartmentRecipients.stickerId, id)),
  ]);
  const ids = [...new Set([...individuals, ...groups].map(item => item.id))].filter(employeeId => employeeId !== note.authorId);
  await sendToEmployees(db, env, ids, { id, reply: !!note.parentId }, send);
}

export async function sendCompletionPush(db: Database, env: Env, id: string, revision: number, send: typeof webpush.sendNotification = webpush.sendNotification) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const [note] = await db.select().from(stickers).where(eq(stickers.id, id));
  if (!note) return;
  await sendToEmployees(db, env, [note.authorId], { id, completed: true, eventId: `${id}:done:${revision}` }, send);
}

async function sendToEmployees(db: Database, env: Env, ids: string[], payload: { id: string; reply?: boolean; completed?: boolean; eventId?: string }, send: typeof webpush.sendNotification) {
  if (!ids.length) return;
  const targets = await db.select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth, employeeId: pushSubscriptions.employeeId }).from(pushSubscriptions)
    .innerJoin(employees, eq(employees.id, pushSubscriptions.employeeId)).innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
    .where(and(inArray(pushSubscriptions.employeeId, ids), eq(employees.isActive, true), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  await Promise.all(targets.map(async target => {
    try {
      await send({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify({ ...payload, employeeId: target.employeeId }), {
        vapidDetails: { subject: env.APP_ORIGIN.startsWith('https:') ? env.APP_ORIGIN : 'mailto:admin@example.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, TTL: 300, urgency: 'high', timeout: 10000,
      });
      deliveryStatus.set(target.employeeId, { result: 'accepted', at: new Date().toISOString() });
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? String(error.statusCode) : undefined;
      const network = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : undefined;
      deliveryStatus.set(target.employeeId, { result: 'failed', code: status ?? network ?? 'UNKNOWN', at: new Date().toISOString() });
      if (typeof error === 'object' && error !== null && 'statusCode' in error && (error.statusCode === 404 || error.statusCode === 410)) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, target.endpoint));
      }
    }
  }));
}
