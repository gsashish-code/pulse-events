import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
  resolve: {
    alias: {
      'pulse-events': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
})
