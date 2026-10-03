import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    // The music engine and the DSP are pure, so the whole suite runs under
    // node. A component test that needs a DOM opts in with a file-level
    // // @vitest-environment jsdom comment rather than slowing everything down.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
