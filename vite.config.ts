import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  /*
    Relative, so the built app works wherever it is served from.

    GitHub Pages puts a project site under `/<repo>/`, and an absolute
    base of `/` makes every asset URL a 404 there. Hard-coding
    `/pitch_space/` instead would fix Pages and break `npm run dev`,
    the preview harness, and any other host — and the repository name
    is not a fact about the app.

    `./` costs nothing here because routing is by hash (`#/scales`), so
    there is no server-side path for a relative base to confuse. The
    one thing it will interact with is the service worker when that
    lands: a worker's scope is its own directory, which is what we
    want for a project site, but it is worth re-checking rather than
    assuming.
  */
  base: './',
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
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
