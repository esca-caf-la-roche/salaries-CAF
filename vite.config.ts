import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/salaries-CAF/' : '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Keep the per-test timeout clearly above Testing Library's async query timeout
    // (5 s, see src/test/setup.ts) so a hard failure still surfaces RTL's diagnostics.
    testTimeout: 15000,
  },
})
