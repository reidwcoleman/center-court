import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // relative asset URLs in the build so it works from any sub-path (GitHub Pages)
  base: command === 'build' ? './' : '/',
  server: { port: 5210, open: false, hmr: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
}));
