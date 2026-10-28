import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    watch: { ignored: ['**/work/**', '**/tests/**', '**/dist/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/work/**', '**/src/server/**'] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:4174', changeOrigin: false, timeout: 0, proxyTimeout: 0 },
    },
  },
  build: { outDir: 'dist/client', emptyOutDir: true, target: 'es2023' },
});
