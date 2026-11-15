import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:5179',
    viewport: { width: 1440, height: 900 },
    // Real GPU (Metal on macOS) instead of SwiftShader, so the ≤200 ms highlight check measures a laptop, not a CPU rasterizer.
    launchOptions: { args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true },
});
