import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };

  const CLIENT_PORT = Number(env.VITE_DEV_SERVER_PORT ?? 5173);
  const API_URL = env.VITE_API_URL ?? 'http://127.0.0.1:4000';
  const ALLOWED_HOSTS_ENV = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
    : [];
  const DEFAULT_ALLOWED_HOSTS: string[] = [
    'localhost',
    '127.0.0.1',
    '::1',
    '.trycloudflare.com',
  ];
  const ALLOWED_HOSTS = [...DEFAULT_ALLOWED_HOSTS, ...ALLOWED_HOSTS_ENV];

  return {
    plugins: [react()],
    server: {
      port: CLIENT_PORT,
      open: true,
      headers: SECURITY_HEADERS,
      allowedHosts: ALLOWED_HOSTS,
      watch: {
        ignored: [
          '**/workers/.wrangler/**',
        ],
      },
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          ws: true,
        },
        '/socket.io': {
          target: API_URL,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist/client',
    },
    preview: {
      headers: SECURITY_HEADERS,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
        '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      },
    },
  };
});
