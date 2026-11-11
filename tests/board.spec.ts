import { expect, test, noteId, serverNotes, browserFixture } from './fixtures';

test('композиция и отметки сохраняются на сервере после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sticky-note')).toHaveCount(8);
  await page.screenshot({ path: '.local/preview-desktop.png' });
  const maria = page.locator('[data-note-id="' + noteId('maria-1') + '"]');
  await expect(maria.getByLabel('Готово')).toBeChecked();
  await maria.getByLabel('Прочитано').uncheck();
  await expect(maria.getByLabel('Готово')).not.toBeChecked();
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === noteId('maria-1'))?.read).toBe(false);
  await page.reload();
  await expect(maria.getByLabel('Прочитано')).not.toBeChecked();
  await expect(maria.getByLabel('Готово')).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('stickerboard:v1'))).toBeNull();
});

test('дата и время создания видны на записке и ответе после перезагрузки', async ({ page }) => {
  await page.goto('/');
  const notes = await serverNotes(page);
  for (const id of [noteId('anna-1'), noteId('denis-1')]) {
    const createdAt = notes.find(note => note.id === id)!.createdAt!;
    const expected = await page.evaluate(value => new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value)), createdAt);
    const timestamp = page.locator(`[data-note-id="${id}"] time`);
    await expect(timestamp).toHaveAttribute('datetime', createdAt);
    await expect(timestamp).toHaveText(expected.replace(', ', ' · '));
  }
  await expect(page.getByText('ОТТИСКИ:', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(`[data-note-id="${noteId('anna-1')}"] time`)).toHaveAttribute('datetime', notes.find(note => note.id === noteId('anna-1'))!.createdAt!);
});

test('перемещение группы с ответом и сохранение координат', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('[data-group-id="' + noteId('anna-1') + '"]');
  const reply = root.locator('.reply-note');
  await expect(reply).toBeVisible();
  const before = (await root.boundingBox())!;
  const replyBefore = (await reply.boundingBox())!;
  const box = (await root.locator('.note-drag-handle').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12);
  await expect(root).toHaveClass(/is-dragging/);
  await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2 + 55, { steps: 10 });
  await page.mouse.up();
  await expect(root).not.toHaveClass(/is-dragging/);
  expect((await root.boundingBox())!.x - before.x).toBeCloseTo(95, 0);
  expect((await reply.boundingBox())!.x - replyBefore.x).toBeCloseTo(95, 0);
  const position = await root.evaluate(element => ({ x: Number.parseFloat((element as HTMLElement).style.left), y: Number.parseFloat((element as HTMLElement).style.top) }));
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === noteId('anna-1'))?.x).toBe(position.x);
  await page.reload();
  await expect(root).toHaveCSS('left', position.x + 'px');
  await expect(root).toHaveCSS('top', position.y + 'px');
});

test('лента ответа сохраняет размеры при переходе в профиль и обратно', async ({ page }) => {
  await page.goto('/');
  const tape = page.locator('.reply-tape').first();
  await expect(tape).toBeVisible();
  const before = await tape.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Мой профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Ваш почерк' })).toBeVisible();
  await expect(tape).toHaveAttribute('viewBox', before!);
  await page.getByRole('button', { name: 'К доске' }).click();
  await expect(tape).toBeVisible();
  await expect(tape).toHaveAttribute('viewBox', before!);
});

test('поиск, фильтры и переключение досок', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'С ответами', exact: true }).click();
  await expect(page.locator('.sticky-note')).toHaveCount(2);
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск по запискам' }).fill('шлюза');
  await expect(page.locator('.sticky-note')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Поиск по запискам' }).fill('');
  await page.getByRole('combobox', { name: 'Отдел автора' }).selectOption({ label: 'Юридический отдел' });
  await expect(page.locator('.sticky-note')).toHaveCount(1);
  await page.getByRole('button', { name: 'Бухгалтерия FIN' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Бухгалтерия');
  await expect(page.locator('.sticky-note')).toHaveCount(3);
});

test('создание, ответ и безопасное отображение пользовательского текста', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый стикер' }).click();
  await page.getByLabel('Текст записки').fill('Проверка новой записки <script>нет</script>');
  await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  const note = page.locator('.sticky-note').filter({ hasText: 'Проверка новой записки' });
  await expect(note).toBeVisible();
  const style = await note.getAttribute('style');
  await note.getByRole('button', { name: 'Ответить', exact: true }).click();
  await page.getByLabel('Ваш ответ').fill('Принято, проверим сегодня.');
  await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  const reply = page.locator('.reply-note').filter({ hasText: 'Принято, проверим сегодня.' });
  await expect(reply).toBeVisible();
  const paper = await reply.getAttribute('style');
  await page.reload();
  await expect(page.locator('.sticky-note')).toHaveCount(10);
  await expect(note).toHaveAttribute('style', style!);
  await expect(reply).toHaveAttribute('style', paper!);
});

test('варианты бумаги стабильны, старая локальная копия сохраняется и выгружается', async ({ page }) => {
  await page.goto('/');
  for (const [index, variant] of ['soft', 'corners', 'torn', 'corners-torn'].entries()) {
    const id = ['anna-1', 'denis-1', 'elena-1', 'maxim-1'][index];
    await expect(page.locator('[data-note-id="' + noteId(id) + '"]')).toHaveAttribute('data-paper-variant', variant);
  }
  const own = browserFixture.employees.find(person => person.legacyId === 'konstantin')!.id;
  const board = browserFixture.departments.find(department => department.legacyId === 'it')!.boardId;
  const legacy = JSON.stringify({ version: 1, notes: [{ id: 'legacy-note', boardId: board, authorId: own, text: 'Моя локальная копия', time: '08:00', x: 48, y: 94, rotation: 0, read: true, done: true }] });
  await page.evaluate(value => localStorage.setItem('stickerboard:v1', value), legacy);
  await page.reload();
  await expect(page.getByText('В браузере есть прежняя локальная копия.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать копию' }).click();
  await (await download).saveAs('.local/legacy-export.json');
  await page.getByRole('button', { name: 'Перенести мои записки' }).click();
  const imported = page.locator('.sticky-note').filter({ hasText: 'Моя локальная копия' });
  await expect(imported).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перенести мои записки' })).toBeEnabled();
  await page.getByRole('button', { name: 'Перенести мои записки' }).click();
  await expect(imported).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('stickerboard:v1'))).toBe(legacy);
  await expect(imported.getByLabel('Прочитано')).not.toBeChecked();
});

test('мобильная навигация и прокрутка свободной доски', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.sticky-note')).toHaveCount(8);
  await page.screenshot({ path: '.local/preview-mobile.png' });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('button', { name: 'Юридический отдел LAW' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Юридический отдел');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.board-viewport').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('повреждённое локальное хранилище не влияет на общую доску и клавиатурное перемещение', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stickerboard:v1', '{invalid'));
  await page.goto('/');
  await expect(page.locator('.sticky-note')).toHaveCount(8);
  const root = page.locator('[data-group-id="' + noteId('elena-1') + '"]');
  // Keyboard dragging may scroll the viewport. Compare board coordinates, not only its CSS transform.
  const position = () => root.evaluate(element => {
    const viewport = element.closest('.board-viewport')!;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x + viewport.scrollLeft, y: bounds.y + viewport.scrollTop };
  });
  const initial = await position();
  const saved = (await serverNotes(page)).find(note => note.id === noteId('elena-1'))!;
  await root.locator('.note-drag-handle').focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveClass(/is-dragging/);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await position()).x).toBeCloseTo(initial.x + 25, 0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await position()).y).toBeCloseTo(initial.y + 25, 0);
  await page.keyboard.press('Space');
  await expect(root).not.toHaveClass(/is-dragging/);
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === saved.id)?.x).toBe(saved.x + 25);
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === saved.id)?.y).toBe(saved.y + 25);
  expect(await page.evaluate(() => localStorage.getItem('stickerboard:v1'))).toBe('{invalid');
});

test('доска расширяется за экран и сохраняет отдалённую записку', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('[data-group-id="' + noteId('elena-1') + '"]');
  await root.locator('.note-drag-handle').focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveClass(/is-dragging/);
  for (const key of [...Array<string>(40).fill('ArrowRight'), ...Array<string>(50).fill('ArrowDown')]) {
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await page.keyboard.press('Space');
  await expect(root).not.toHaveClass(/is-dragging/);
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === noteId('elena-1'))?.x).toBeGreaterThan(1000);
  const note = (await serverNotes(page)).find(note => note.id === noteId('elena-1'))!;
  expect(note.y).toBeGreaterThan(1000);
  const extent = await page.locator('.board-surface').evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }));
  expect(extent.width).toBeGreaterThan(note.x + 300);
  expect(extent.height).toBeGreaterThan(note.y + 250);
  await page.reload();
  await expect(root).toHaveCSS('left', note.x + 'px');
  await expect(root).toHaveCSS('top', note.y + 'px');
});
