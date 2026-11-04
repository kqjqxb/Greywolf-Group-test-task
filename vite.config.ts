import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /<repo>/, so all asset URLs need this prefix.
export default defineConfig({
  base: '/Greywolf-Group-test-task/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
