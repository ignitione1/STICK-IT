import { expect, test, serverNotes } from './fixtures';

test('скотч соединяет цепочку ответов, не закрывает содержимое и движется с группой', async ({ page }) => {
  await page.goto('/');
  const parent = page.locator('[data-note-id="00000000-0000-4000-8000-000000001001"]');
  const group = page.locator('[data-group-id="00000000-0000-4000-8000-000000001001"]');
  for (const text of ['Дополнительный ответ', 'Ещё одна записка в цепочке']) {
    await parent.getByRole('button', { name: 'Ответить', exact: true }).click();
    await page.getByLabel('Ваш ответ').fill(text);
    await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  }
  await expect(group.locator('.reply-tape')).toHaveCount(3);
  await parent.locator('.note-drag-handle').focus();
  await page.mouse.move(1100, 1100);
  const chain = await group.evaluate(element => {
    const notes = Array.from(element.querySelectorAll<HTMLElement>('[data-note-id]'));
    const tapes = Array.from(element.querySelectorAll<SVGSVGElement>('.reply-tape'));
    const links = tapes.map(tape => {
      function paperAt(end: 'from' | 'to') {
        const point = new DOMPoint(Number(tape.dataset[`${end}X`]), Number(tape.dataset[`${end}Y`]));
        const viewport = point.matrixTransform(tape.getScreenCTM()!);
        return document.elementsFromPoint(viewport.x, viewport.y).map(hit => hit.closest<HTMLElement>('[data-note-id]')?.dataset.noteId).find(Boolean);
      }
      const film = tape.querySelector<SVGPathElement>('.reply-tape-material')!;
      const bounds = film.getBoundingClientRect();
      const inverse = film.getScreenCTM()!.inverse();
      const overlaps = new Set<string>();
      // Hit-test the actual rotated film, rather than the empty corners of its bounding box.
      for (let x = bounds.left + 1; x < bounds.right; x += 2) {
        for (let y = bounds.top + 1; y < bounds.bottom; y += 2) {
          if (!film.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse))) continue;
          const content = document.elementsFromPoint(x, y).map(hit => hit.closest('.note-author, .note-message, .attachment, .department-stamp, .note-actions label, .note-actions button, .note-management button')).find(hit => hit && element.contains(hit));
          if (content) overlaps.add(content.className || content.textContent || 'control');
        }
      }
      return { from: tape.dataset.fromNote, to: tape.dataset.toNote, fromHit: paperAt('from'), toHit: paperAt('to'), pointerEvents: getComputedStyle(tape).pointerEvents, overlaps: [...overlaps] };
    });
    return { ids: notes.map(note => note.dataset.noteId), links };
  });
  for (const [index, link] of chain.links.entries()) {
    expect(link.from).toBe(chain.ids[index]);
    expect(link.to).toBe(chain.ids[index + 1]);
    expect(link.fromHit).toBe(link.from);
    expect(link.toHit).toBe(link.to);
    expect(link.pointerEvents).toBe('none');
    expect(link.overlaps).toEqual([]);
  }
  await group.screenshot({ path: '.local/preview-reply-chain.png' });
  const tapesBefore = await group.locator('.reply-tape').evaluateAll(tapes => tapes.map(tape => ({ x: tape.getBoundingClientRect().x, y: tape.getBoundingClientRect().y })));
  const storedReplies = await page.evaluate(async () => (await (await fetch('/api/stickers')).json()).notes.filter((note: { parentId?: string }) => note.parentId === '00000000-0000-4000-8000-000000001001'));
  const handle = parent.locator('.note-drag-handle');
  const box = (await handle.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10);
  await expect(group).toHaveClass(/is-dragging/);
  await page.mouse.move(start.x + 70, start.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect(group).not.toHaveClass(/is-dragging/);
  const tapesAfter = await group.locator('.reply-tape').evaluateAll(tapes => tapes.map(tape => ({ x: tape.getBoundingClientRect().x, y: tape.getBoundingClientRect().y })));
  for (const [index, tape] of tapesAfter.entries()) {
    expect(tape.x - tapesBefore[index].x).toBeCloseTo(70, 0);
    expect(tape.y - tapesBefore[index].y).toBeCloseTo(40, 0);
  }
  expect(await page.evaluate(async () => (await (await fetch('/api/stickers')).json()).notes.filter((note: { parentId?: string }) => note.parentId === '00000000-0000-4000-8000-000000001001'))).toEqual(storedReplies);
  const savedPosition = await group.evaluate(element => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }));
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === '00000000-0000-4000-8000-000000001001')?.x).toBeCloseTo(Number.parseFloat(savedPosition.left), 3);
  await page.reload();
  await expect(group).toHaveCSS('left', savedPosition.left);
  await expect(group).toHaveCSS('top', savedPosition.top);
  await expect(group.locator('.reply-tape')).toHaveCount(3);
  await parent.getByLabel('Прочитано').check();
  await parent.getByLabel('Готово').check();
  const lastReply = group.locator('.reply-note').last();
  await lastReply.getByLabel('Прочитано').check();
  await lastReply.getByLabel('Готово').check();
  await lastReply.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('стикеры перекрываются, активная группа поднимается и сохраняет координаты', async ({ page }) => {
  await page.goto('/');
  const target = page.locator('[data-group-id="00000000-0000-4000-8000-000000001003"]');
  const parentGroup = page.locator('[data-group-id="00000000-0000-4000-8000-000000001001"]');
  const handle = target.locator('.note-drag-handle');
  const before = (await target.boundingBox())!;
  const box = (await handle.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 10, start.y + 10);
  await expect(target).toHaveClass(/is-dragging/);
  await page.mouse.move(start.x - 300, start.y + 60, { steps: 12 });
  await expect(target).toHaveCSS('z-index', '2147483647');
  await page.mouse.up();
  await expect(target).not.toHaveClass(/is-dragging/);
  const after = (await target.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(-300, 0);
  expect(after.y - before.y).toBeCloseTo(60, 0);
  await page.mouse.move(1100, 1100);
  const hit = () => page.evaluate(() => {
    const bounds = document.querySelector('[data-note-id="00000000-0000-4000-8000-000000001003"]')!.getBoundingClientRect();
    return document.elementsFromPoint(bounds.left + 50, bounds.top + 50).map(element => element.closest<HTMLElement>('[data-note-id]')?.dataset.noteId).find(Boolean);
  });
  await handle.focus();
  await expect.poll(hit).toBe('00000000-0000-4000-8000-000000001003');
  await parentGroup.locator('.note-drag-handle').first().focus();
  await expect.poll(hit).toBe('00000000-0000-4000-8000-000000001001');
  const savedPosition = await target.evaluate(element => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }));
  await expect.poll(async () => (await serverNotes(page)).find(note => note.id === '00000000-0000-4000-8000-000000001003')?.x).toBeCloseTo(Number.parseFloat(savedPosition.left), 3);
  await page.reload();
  await expect(target).toHaveCSS('left', savedPosition.left);
  await expect(target).toHaveCSS('top', savedPosition.top);
});
