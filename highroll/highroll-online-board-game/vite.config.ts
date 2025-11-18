import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config } from 'dotenv';
import { fileURLToPath, URL } from 'node:url';

config();

const CLIENT_PORT = Number(process.env.VITE_DEV_SERVER_PORT ?? 5173);
const API_URL = process.env.VITE_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: CLIENT_PORT,
    open: true,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
});