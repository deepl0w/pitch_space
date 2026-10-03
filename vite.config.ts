import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The notation library and its font dominate the bundle, and they are
        // one unit: splitting them out keeps the app shell small and gives the
        // service worker a stable chunk to precache, which is what makes the
        // score usable offline rather than blank.
        manualChunks: (id: string) =>
          id.includes('node_modules/vexflow') ? 'notation' : undefined,
      },
    },
  },
  test: {
    // The music engine and the DSP are pure, so the whole suite runs under
    // node. A component test that needs a DOM opts in with a file-level
    // // @vitest-environment jsdom comment rather than slowing everything down.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
