import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInitialNotes } from '../src/data';
import type { StickyNoteData } from '../src/types';

export const browserFixture = JSON.parse(readFileSync(new URL('./browser-fixture.json', import.meta.url), 'utf8')) as {
  password: string; departments: { legacyId: string; id: string; boardId: string }[];
  employees: { legacyId: string; id: string; login: string }[];
};
const legacyIds = createInitialNotes().map(note => note.id);
export const noteId = (legacy: string) => '00000000-0000-4000-8000-' + String(legacyIds.indexOf(legacy) + 1001).padStart(12, '0');
export const testWithoutLogin = base.extend({
  page: async ({ page }, use, info) => {
    const bytes = createHash('sha256').update(info.testId).digest();
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.' + bytes[0] + '.' + bytes[1] + '.' + bytes[2] });
    const reset = await page.request.post('http://127.0.0.1:3101/__test/reset', { data: { notes: createInitialNotes() } });
    expect(reset.ok(), await reset.text()).toBe(true);
    await use(page);
  },
});
export const test = testWithoutLogin.extend({
  page: async ({ page }, use) => {
    const response = await page.request.post('/api/auth/login', {
      headers: { origin: 'http://127.0.0.1:5174', 'x-stickerboard-request': '1' },
      data: { login: 'konstantin', password: browserFixture.password },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await use(page);
  },
});
export async function serverNotes(page: import('@playwright/test').Page): Promise<StickyNoteData[]> {
  return (await (await page.request.get('/api/stickers')).json()).notes;
}
export { expect };
