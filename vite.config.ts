import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle deps used only inside the IFC worker so the first conversion doesn't trigger a dev reload.
  optimizeDeps: { include: ['@thatopen/fragments', 'three', 'web-ifc'] },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts?(x)'], testTimeout: 120_000 },
});
