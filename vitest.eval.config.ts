import { defineConfig } from 'vitest/config'

// The evals spend the writer's Claude Code usage, so they live behind
// `pnpm eval:coach` and never run with `pnpm test`.
export default defineConfig({
  test: {
    include: ['evals/**/*.eval.ts'],
    environment: 'node',
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ['verbose'],
  },
})
