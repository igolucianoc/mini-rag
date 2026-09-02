#!/bin/sh
# Entrypoint da API em container.
#
# Torna a subida previsível: aplica as migrations pendentes (idempotente) e,
# se RUN_SEED=true, roda o seed determinístico (também idempotente) antes de
# iniciar o servidor. `prisma migrate deploy` só aplica migrations já existentes
# (não gera novas) e é seguro em produção.
set -e

echo "[entrypoint] Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Executando seed determinístico (idempotente)..."
  # O seed importa de src/ (aliases/relativos), então roda via tsx.
  npx tsx prisma/seed.ts
fi

echo "[entrypoint] Iniciando API..."
exec node dist/infra/main.js
