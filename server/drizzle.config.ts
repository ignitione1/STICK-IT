import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/config/env.js';

const env = loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Offline generation needs only the schema. Applying migrations requires a real URL.
  ...(env.DATABASE_URL ? { dbCredentials: { url: env.DATABASE_URL } } : {}),
  strict: true,
});
