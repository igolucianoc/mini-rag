# syntax=docker/dockerfile:1

# --- Stage 1: dependências + build ---
FROM node:22-alpine AS builder
WORKDIR /app

# Manifests (contexto de build é a pasta api/)
COPY package.json ./
COPY prisma ./prisma

# Instala todas as dependências (inclui dev para o build)
RUN npm install

# Gera o Prisma Client
RUN npx prisma generate

# Código-fonte e build
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies para o runtime
RUN npm prune --omit=dev

# --- Stage 2: runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]
