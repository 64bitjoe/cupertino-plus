import { defineConfig } from 'vitest/config'

/**
 * Separate from `vite.config.ts` on purpose: that config switches its root to `dev/`
 * for the harness, and Vitest runs through the same `serve` branch — tests would then
 * be looked for in the wrong directory.
 *
 * Only the pure layers are covered here (flow, packing, formatting). They are where
 * the rules live and where a regression is invisible until someone looks at a card.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The rules are all about "what day is it": a machine in another timezone must
    // not get different answers.
    environment: 'node',
  },
})
