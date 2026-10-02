import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/apoyo/postgres-global.ts'],
    // Arrancar PostgreSQL la primera vez (initdb incluido) lleva unos segundos.
    hookTimeout: 60_000,
    testTimeout: 15_000,
  },
});
