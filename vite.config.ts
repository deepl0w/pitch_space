import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
  plugins: [
    react(),
    /*
      The installable half of "one codebase, two shipping vehicles".

      `vite-plugin-pwa` has been a dependency since the scaffold and was
      never wired, which `test.sh --offline` has been saying out loud
      every run — "no service worker in dist/, the PWA plugin is not
      wired up yet". It stopped being a todo and became a defect the
      moment the app was deployed: the brief promises something a
      musician can install, and the user role opened the live site and
      found no manifest and a 404.

      `autoUpdate` rather than a prompt. This is a practice tool with no
      documents to lose — there is nothing a reload can interrupt that
      the user would mind — and an update prompt is a dialog standing
      between somebody and the thing they opened the app to do.
    */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pitch Space',
        short_name: 'Pitch Space',
        description: 'Ear training and sight reading, generated from real patterns.',
        // Matches `--bg` in the dark theme, so the splash and the app
        // agree rather than flashing white on the way in.
        background_color: '#141210',
        theme_color: '#141210',
        display: 'standalone',
        // Relative, like `base`, so the manifest works under a project
        // site's subdirectory as well as at a domain root.
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // `maskable` as well as `any`: without one, Android draws the
          // icon shrunk inside a white circle.
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The notation font is the reason offline is worth claiming at
        // all — a cached shell that cannot draw a stave is a blank
        // exercise — so the glyph formats are precached with everything
        // else rather than left to a runtime cache.
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,otf}'],
      },
    }),
  ],
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
