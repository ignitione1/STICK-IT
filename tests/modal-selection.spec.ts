import { test, expect } from './fixtures';

test('выделение текста за пределами окна не закрывает черновик', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый стикер' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый стикер' });
  const field = dialog.getByLabel('Текст записки');
  await field.fill('Текст, который нужно выделить');
  const bounds = await field.boundingBox();
  if (!bounds) throw new Error('Поле записки не найдено');
  await page.mouse.move(bounds.x + 20, bounds.y + 15);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(field).toHaveValue('Текст, который нужно выделить');
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});
