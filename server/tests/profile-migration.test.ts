import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('расширение профиля сохраняет старые записки и соответствующие бумаге крепления', { timeout: 60000 }, async () => {
  const pg = new PGlite();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  const migration = (tag: string) => readFileSync(new URL('../drizzle/' + tag + '.sql', import.meta.url), 'utf8');
  try {
    for (const entry of journal.entries.slice(0, 3)) await pg.exec(migration(entry.tag));
    await pg.exec(`INSERT INTO departments (id, name, code, color) VALUES ('00000000-0000-4000-8000-000000000001', 'Отдел', 'test', '#123456');
      INSERT INTO boards (id, name, is_general) VALUES ('00000000-0000-4000-8000-000000000002', 'Доска', true);`);
    const expected = { yellow: 'pin', mint: 'clip', pink: 'tape', blue: 'pin', cream: 'fold' };
    for (const [style] of Object.entries(expected)) {
      const result = await pg.query<{ id: string }>(`INSERT INTO employees (login, password_hash, display_name, paper_style)
        VALUES ($1, 'fixture-hash', 'Сотрудник', $2::paper_style) RETURNING id`, [style, style]);
      await pg.query(`INSERT INTO stickers (board_id, author_id, author_department_id, text, paper_style, paper_seed)
        VALUES ('00000000-0000-4000-8000-000000000002', $1, '00000000-0000-4000-8000-000000000001', 'Старая записка', $2::paper_style, 42)`, [result.rows[0].id, style]);
    }
    for (const entry of journal.entries.slice(3)) await pg.exec(migration(entry.tag));
    for (const table of ['employees', 'stickers']) {
      const { rows } = await pg.query<{ paper_style: keyof typeof expected; fastening: string }>(`SELECT paper_style, fastening FROM ${table}`);
      assert.equal(rows.length, 5);
      for (const row of rows) assert.equal(row.fastening, expected[row.paper_style]);
    }
    const { rows } = await pg.query<{ text: string; paper_seed: number }>('SELECT text, paper_seed FROM stickers');
    assert.ok(rows.every(row => row.text === 'Старая записка' && Number(row.paper_seed) === 42));
  } finally { await pg.close(); }
});
