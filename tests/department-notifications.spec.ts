import type { Page } from '@playwright/test';
import { test, expect, browserFixture } from './fixtures';

test('все участники отдела получают счётчик и звук для записок и ответов отделу', async ({ page, browser }) => {
  test.setTimeout(60000);
  async function instrument(target: Page) {
    await target.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      Object.assign(window, { messageSounds: 0 });
      AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
        (window as unknown as { messageSounds: number }).messageSounds++;
        return start.call(this, when, offset, duration);
      };
    });
  }
  const denisContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.100.88.11' } });
  const elenaContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.100.88.12' } });
  const sender = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.100.88.13' } });
  async function login(context: typeof sender, login: string) {
    const response = await context.request.post('http://127.0.0.1:5174/api/auth/login', {
      headers: { origin: 'http://127.0.0.1:5174', 'x-stickerboard-request': '1' }, data: { login, password: browserFixture.password },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).csrfToken as string;
  }
  try {
    await login(denisContext, 'denis'); await login(elenaContext, 'elena'); const csrf = await login(sender, 'anna');
    const denis = await denisContext.newPage(); const elena = await elenaContext.newPage();
    const pages = [page, denis, elena];
    for (const target of pages) {
      await instrument(target);
      await target.goto('http://127.0.0.1:5174');
      await expect(target.locator('.sync-message')).toHaveCount(0);
      await target.getByRole('button', { name: /^Уведомления/ }).click(); // Unlock audio with a real gesture.
    }
    const count = async (target: Page) => Number((await target.locator('.notification-count').allTextContents())[0] ?? '0');
    const sounds = (target: Page) => target.evaluate(() => (window as unknown as { messageSounds: number }).messageSounds);
    const initial = await Promise.all(pages.map(count));
    const it = browserFixture.departments.find(department => department.legacyId === 'it')!;
    const general = browserFixture.departments.find(department => department.legacyId === 'general')!;
    let rootId = '';
    for (let index = 0; index < 3; index++) {
      const id = crypto.randomUUID();
      const response = await sender.request.post('http://127.0.0.1:5174/api/stickers', {
        headers: { origin: 'http://127.0.0.1:5174', 'x-stickerboard-request': '1', 'x-csrf-token': csrf },
        data: { id, text: 'Уведомление всем в IT ' + index, boardId: index === 1 ? general.boardId : it.boardId,
          ...(index === 0 ? {} : { recipientDepartmentIds: [it.id] }), ...(index === 2 ? { parentId: rootId } : {}) },
      });
      expect(response.ok(), await response.text()).toBe(true);
      if (!index) rootId = id;
      for (const target of pages) {
        const refreshed = target.waitForResponse(response => response.url().endsWith('/api/stickers'));
        await target.evaluate(() => window.dispatchEvent(new Event('focus'))); await refreshed;
      }
      await expect.poll(() => sounds(page)).toBe(index + 1);
      await expect.poll(() => sounds(denis)).toBe(index + 1);
      await expect.poll(() => count(page)).toBe(initial[0] + index + 1);
      await expect.poll(() => count(denis)).toBe(initial[1] + index + 1);
      expect(await count(elena)).toBe(initial[2]);
      expect(await sounds(elena)).toBe(0);
    }
  } finally { await denisContext.close(); await elenaContext.close(); await sender.close(); }
});
