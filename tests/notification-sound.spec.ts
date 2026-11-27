import { test, expect, browserFixture, serverNotes } from './fixtures';

test('звук только новых входящих записок и ответов, настройка сохраняется', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    Object.assign(window, { soundVoices: 0 });
    AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
      const state = window as unknown as { soundVoices: number };
      state.soundVoices++;
      if (!this.buffer || this.buffer.duration <= 0) throw new Error('Звук не декодирован');
      return original.call(this, when, offset, duration);
    };
  });
  let notes = await serverNotes(page);
  const template = notes[0];
  const self = browserFixture.employees.find(person => person.legacyId === 'konstantin')!.id;
  const author = browserFixture.employees.find(person => person.legacyId === 'anna')!.id;
  await page.route('**/api/stickers', route => route.fulfill({ json: { notes } }));
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Звук уведомлений', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sync-message')).toHaveCount(0);
  const voices = () => page.evaluate(() => (window as unknown as { soundVoices: number }).soundVoices);
  expect(await voices()).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect.poll(voices).toBe(1); // Preview plays the decoded local ICQ recording.
  const refresh = async () => {
    const response = page.waitForResponse(response => response.url().endsWith('/api/stickers'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await response;
  };
  notes = [...notes, { ...template, id: crypto.randomUUID(), authorId: author, isRecipient: true, isArchived: false, read: false, text: 'Новое входящее' }];
  await refresh();
  await expect.poll(voices).toBe(2);
  await refresh();
  expect(await voices()).toBe(2);
  notes = notes.map(note => ({ ...note, read: true }));
  await refresh();
  notes = notes.map(note => ({ ...note, read: false }));
  await refresh();
  expect(await voices()).toBe(2);
  notes = [...notes,
    { ...template, id: crypto.randomUUID(), authorId: self, isRecipient: true, isArchived: false, read: false },
    { ...template, id: crypto.randomUUID(), authorId: author, isRecipient: false, isArchived: false, read: false },
    { ...template, id: crypto.randomUUID(), authorId: author, isRecipient: true, isArchived: true, read: false },
  ];
  await refresh();
  expect(await voices()).toBe(2);
  // Several replies in one refresh produce a single sound.
  notes = [...notes, ...[1, 2].map(() => ({ ...template, id: crypto.randomUUID(), parentId: template.id,
    authorId: author, isRecipient: true, isArchived: false, read: false }))];
  await refresh();
  await expect.poll(voices).toBe(3);
  const ownId = crypto.randomUUID();
  notes = [...notes, { ...template, id: ownId, authorId: self, done: false, doneById: null }];
  await refresh();
  notes = notes.map(note => note.id === ownId ? { ...note, done: true, doneById: author } : note);
  await refresh();
  await expect.poll(voices).toBe(4);
  await refresh();
  expect(await voices()).toBe(4);
  await page.screenshot({ path: '.local/notification-sound-desktop.png' });
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sync-message')).toHaveCount(0);
  expect(await voices()).toBe(0); // Existing unread notes are silent after reload.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  notes = [...notes, { ...template, id: crypto.randomUUID(), authorId: author, isRecipient: true, isArchived: false, read: false }];
  await refresh();
  expect(await voices()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await expect(toggle).toBeVisible();
  await page.screenshot({ path: '.local/notification-sound-mobile.png', animations: 'disabled' });
  await page.reload();
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
