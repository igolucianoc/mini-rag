# syntax=docker/dockerfile:1

# --- Stage 1: dependências + build ---
FROM node:22-alpine AS builder
WORKDIR /app

# Manifests (contexto de build é a pasta api/)
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Instala todas as dependências (inclui dev para o build)
RUN npm install

# Gera o Prisma Client
RUN npx prisma generate

# Código-fonte e build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# openssl é exigido pelo engine do Prisma no Alpine; wget serve ao healthcheck.
RUN apk add --no-cache openssl wget

# Instala apenas dependências de produção. Mantemos prisma (CLI) e tsx como
# runtime deps do container para permitir `prisma migrate deploy` e o seed no
# entrypoint — por isso NÃO fazemos prune de tudo; instalamos o necessário.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm install --no-save prisma@6 tsx@4

# Artefatos e Prisma Client gerado
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Fontes TS são necessárias apenas para o seed via tsx (importa de src/).
# O servidor roda do dist/; o seed é opcional (RUN_SEED) e idempotente.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

# Healthcheck bate no endpoint de saúde da própria API.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
