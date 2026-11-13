import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrationsPath = path.join(rootDir, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);

  return {
    resolve: {
      alias: {
        '@shared': path.join(rootDir, 'src/shared'),
        '@worker': path.join(rootDir, 'src/worker')
      }
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: 'test',
            ENCRYPTION_KEY: 'test-encryption-key-32-chars-minimum'
          }
        }
      })
    ],
    test: {
      setupFiles: ['./tests/setup.ts']
    }
  };
});
