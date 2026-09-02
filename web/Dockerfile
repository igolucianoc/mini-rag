# syntax=docker/dockerfile:1

# --- Stage 1: build ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# NÃO fazer prune: `vite preview` carrega o vite.config.ts em runtime e precisa
# de `vite` e `@vitejs/plugin-vue` (devDependencies). O preview também provê o
# proxy /api -> service api. Servir só o dist estático perderia esse proxy.

# --- Stage 2: runtime (serve estático via vite preview) ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts

EXPOSE 5173

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5173/ || exit 1

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
