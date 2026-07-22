import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: '.',
  publicDir: 'public',
  base: command === 'serve' ? '/' : '/tower-of-power/',
  server: { port: 5185, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
