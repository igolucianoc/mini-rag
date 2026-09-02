import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Alvo do proxy /api. Em dev local é o backend em localhost:3000; em container
// (docker compose) aponta para o service `api` via API_PROXY_TARGET=http://api:3000.
// O proxy vale tanto para `vite dev` (server) quanto para `vite preview` (runtime
// do container), mantendo o front acessando a API sob o mesmo /api nos dois casos.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const proxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 5173,
    proxy,
  },
});
