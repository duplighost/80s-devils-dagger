import { defineConfig } from 'vite';

// Relative base so the production build runs from any path (file server, itch.io zip, GH pages...).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
