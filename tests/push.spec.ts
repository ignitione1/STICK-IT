import { test, expect, browserFixture, serverNotes } from './fixtures';

test('push и обновление доски не дублируют звук; повтор события не воспроизводится', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
    const channel = new EventTarget();
    const worker = { postMessage() {} };
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } };
    const registration = { active: worker, pushManager: { getSubscription: async () => ({ toJSON: () => subscription, unsubscribe: async () => true }) } };
    Object.assign(channel, { register: async () => registration, getRegistration: async () => registration, ready: Promise.resolve(registration) });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: channel });
    const original = AudioBufferSourceNode.prototype.start;
    Object.assign(window, { pushSounds: 0 });
    AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
      (window as unknown as { pushSounds: number }).pushSounds++;
      return original.call(this, when, offset, duration);
    };
  });
  await page.route('**/api/push/config', route => route.fulfill({ json: { publicKey: 'test' } }));
  await page.route('**/api/push/subscription', route => route.fulfill({ json: { ok: true } }));
  let notes = await serverNotes(page);
  const template = notes[0];
  const author = browserFixture.employees.find(person => person.legacyId === 'anna')!.id;
  await page.route('**/api/stickers', route => route.fulfill({ json: { notes } }));
  await page.goto('/');
  const push = page.getByRole('button', { name: 'Push-уведомления на рабочем столе' });
  await expect(push).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sync-message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Звук уведомлений', exact: true }).click();
  await page.getByRole('button', { name: 'Звук уведомлений', exact: true }).click();
  const count = () => page.evaluate(() => (window as unknown as { pushSounds: number }).pushSounds);
  await expect.poll(count).toBe(1);
  const id = crypto.randomUUID();
  notes = [...notes, { ...template, id, authorId: author, isRecipient: true, isArchived: false, read: false }];
  const response = page.waitForResponse(response => response.url().endsWith('/api/stickers'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await response;
  expect(await count()).toBe(1);
  await page.evaluate(noteId => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'stickit-push', id: noteId } })), id);
  await expect.poll(count).toBe(2);
  await page.evaluate(noteId => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'stickit-push', id: noteId } })), id);
  expect(await count()).toBe(2);
});

test('устаревшая подписка с другим ключом заменяется при подключении', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
    const state = { unsubscribed: 0, subscribed: 0 };
    Object.assign(window, { pushSetupState: state });
    const channel = new EventTarget();
    const fresh = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } }) };
    const old = { options: { applicationServerKey: new Uint8Array([9]).buffer }, unsubscribe: async () => { state.unsubscribed++; return true; } };
    const registration = { active: { postMessage() {} }, pushManager: { getSubscription: async () => old, subscribe: async () => { state.subscribed++; return fresh; } } };
    Object.assign(channel, { register: async () => registration, getRegistration: async () => registration, ready: Promise.resolve(registration) });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: channel });
  });
  await page.route('**/api/push/config', route => route.fulfill({ json: { publicKey: 'AQID' } }));
  await page.route('**/api/push/subscription', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Push-уведомления на рабочем столе' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { pushSetupState: unknown }).pushSetupState)).toEqual({ unsubscribed: 1, subscribed: 1 });
});
