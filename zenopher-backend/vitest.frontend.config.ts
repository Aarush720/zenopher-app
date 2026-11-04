import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Reuse the monorepo's installed test runner while keeping browser and Worker
// types in separate TypeScript projects.
export default defineConfig({
  root: fileURLToPath(new URL('../frontend', import.meta.url)),
  resolve: { alias: { vitest: fileURLToPath(new URL('./node_modules/vitest/dist/index.js', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], exclude: ['**/._*'], environment: 'node' },
});
