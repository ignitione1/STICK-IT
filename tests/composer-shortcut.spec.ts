import { test, expect } from './fixtures';

test('Ctrl+Enter отправляет записку и ответ, Enter переносит строку', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый стикер' }).click();
  const text = page.getByLabel('Текст записки');
  await text.fill('Первая строка');
  await text.press('Enter');
  await text.pressSequentially('Вторая строка');
  await expect(text).toHaveValue('Первая строка\nВторая строка');
  await text.press('Control+Enter');
  const note = page.locator('.sticky-note').filter({ hasText: 'Первая строка' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Ответить' }).click();
  const reply = page.getByLabel('Ваш ответ');
  await reply.fill('Ответ с клавиатуры');
  await reply.press('Control+Enter');
  await expect(page.locator('.reply-note').filter({ hasText: 'Ответ с клавиатуры' })).toBeVisible();
});
