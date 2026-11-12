#!/usr/bin/env bash
# Atualiza o sistema no VPS para a última versão do GitHub.
set -euo pipefail
cd "${APP_DIR:-/opt/delivery}"
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
docker compose --env-file .env.production -f docker-compose.prod.yml ps
