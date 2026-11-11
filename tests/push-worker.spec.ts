import { test, expect, browserFixture } from './fixtures';

test('service worker показывает короткое уведомление при push', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Звук уведомлений', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Уведомления/ }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.register('/push-worker.js'); await navigator.serviceWorker.ready; });
  const cdp = await context.newCDPSession(page);
  const registration = new Promise<string>(resolve => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', event => {
      const match = event.registrations.find((row: { scopeURL: string }) => row.scopeURL === 'http://127.0.0.1:5174/');
      if (match) resolve(match.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');
  const registrationId = await registration;
  const employeeId = browserFixture.employees.find(person => person.legacyId === 'konstantin')!.id;
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://127.0.0.1:5174', registrationId, data: JSON.stringify({ id: crypto.randomUUID(), employeeId, reply: true }) });
  await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(note => ({ title: note.title, body: note.body, silent: note.silent })))).toContainEqual({ title: 'Stick-it', body: 'Вам ответили на записку', silent: true });
});
