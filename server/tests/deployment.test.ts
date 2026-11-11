import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { parseEnv } from '../src/config/env.js';
import { validateMigrationTarget } from '../src/db/migration-config.js';

const repo = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');
interface Service {
  image: string;
  ports?: string[];
  build?: unknown;
  environment?: Record<string, string>;
  networks: string[];
  volumes?: string[];
  depends_on?: Record<string, { condition: string }>;
  healthcheck: { test: string[] };
  restart: string;
}
interface Compose {
  services: Record<'web' | 'api' | 'postgres', Service>;
  networks: Record<string, { internal?: boolean } | null>;
  volumes: Record<string, { name: string }>;
}

test('Compose публикует только web на loopback, с отдельной сетью БД и готовностью зависимостей', () => {
  const document = parseDocument(read('compose.yaml'), { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  const compose = document.toJS() as Compose;
  assert.deepEqual(Object.keys(compose.services).sort(), ['api', 'postgres', 'web']);
  for (const [name, service] of Object.entries(compose.services)) {
    assert.equal(service.restart, 'unless-stopped');
    assert.ok(service.healthcheck.test.length);
    assert.equal(service.build, undefined, 'VPS must use prebuilt images');
    if (name === 'web') assert.deepEqual(service.ports, ['127.0.0.1:${HTTP_PORT:-8080}:8080']);
    else assert.equal(service.ports, undefined, 'API and PostgreSQL must not publish host ports');
  }
  assert.equal(compose.services.web.depends_on?.api.condition, 'service_healthy');
  assert.equal(compose.services.api.depends_on?.postgres.condition, 'service_healthy');
  assert.equal(compose.networks.backend?.internal, true);
  assert.deepEqual(compose.services.postgres.networks, ['backend']);
  assert.ok(!compose.services.web.networks.includes('backend'));
  assert.ok(compose.services.postgres.volumes?.includes('postgres_data:/var/lib/postgresql/data'));
  assert.ok(compose.services.api.volumes?.includes('uploads:/app/uploads'));
  assert.equal(compose.services.api.environment?.UPLOAD_DIR, '/app/uploads');
  for (const key of ['DATABASE_URL']) assert.match(compose.services.api.environment?.[key] ?? '', /^\$\{.+:\?/);
  for (const key of ['POSTGRES_PASSWORD', 'POSTGRES_APP_PASSWORD']) {
    assert.match(compose.services.postgres.environment?.[key] ?? '', /^\$\{.+:\?/);
  }
  assert.equal(compose.services.postgres.environment?.POSTGRES_USER, 'postgres');
});

test('Dockerfile копируют существующие входы, готовый frontend и SQL без .env', () => {
  for (const [file, context] of [['server/Dockerfile', 'server/'], ['deploy/web.Dockerfile', '']] as const) {
    const dockerfile = read(file);
    for (const line of dockerfile.split('\n').filter(line => line.startsWith('COPY '))) {
      if (line.includes('--from=')) continue;
      const sources = line.split(/\s+/).slice(1, -1).filter(token => !token.startsWith('--'));
      for (const source of sources) {
        assert.ok(!source.includes('.env') && source !== '.', 'No broad COPY or secrets');
        if (context === '' && source === 'dist/') continue; // dist is built before Docker, not needed by tests.
        assert.ok(existsSync(new URL(context + source, repo)), `Missing COPY input: ${context}${source}`);
      }
    }
  }
  const api = read('server/Dockerfile');
  assert.match(api, /npm ci --omit=dev/);
  assert.match(api, /USER node/);
  assert.match(api, /CMD \["node", "dist\/index.js"\]/);
  assert.ok(!api.includes('db:migrate'));
  assert.match(read('deploy/web.Dockerfile'), /COPY --chown=nginx:nginx dist\//);
  for (const file of ['.dockerignore', 'server/.dockerignore']) {
    assert.ok(read(file).split('\n').includes('**'));
    assert.ok(!read(file).includes('!.env'));
  }
  const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL('server/drizzle', repo)) });
  assert.ok(migrations.length >= 1);
  assert.ok(migrations[0].sql.length > 0);
});

test('миграция принимает только явный целевой Compose-host, базу и роль', () => {
  const expected = { POSTGRES_DB: 'stickerboard', POSTGRES_APP_USER: 'stickerboard' };
  const url = 'postgresql://stickerboard:test-secret@postgres:5432/stickerboard';
  assert.equal(validateMigrationTarget(parseEnv({ DATABASE_URL: url }), expected).database, 'stickerboard');
  const invalid = [undefined, url.replace('@postgres:', '@unknown:'), url.replace(':5432/', ':5433/'),
    url.replace(':5432/stickerboard', ':5432/another'), url.replace('//stickerboard:', '//postgres:'),
    url.replace(':test-secret@', '@'), `${url}?options=unexpected`];
  for (const databaseUrl of invalid) {
    assert.throws(() => validateMigrationTarget(parseEnv({ DATABASE_URL: databaseUrl }), expected));
  }
  assert.throws(() => validateMigrationTarget(parseEnv({ DATABASE_URL: url }), {}));
});
