import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const clientDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(clientDirectory, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, '');
  return {
    root: clientDirectory,
    envDir: projectDirectory,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: resolve(clientDirectory, '../public/app'),
      emptyOutDir: true,
    },
  };
});
