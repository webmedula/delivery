#!/usr/bin/env bash
# Backup diário do banco. Agende no cron do root:
#   15 3 * * * /opt/delivery/deploy/backup.sh >> /var/log/delivery-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/delivery}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/delivery}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"
FILE="$BACKUP_DIR/delivery-$(date +%F-%H%M).sql.gz"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U delivery -d delivery --no-owner | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

find "$BACKUP_DIR" -name 'delivery-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Cópia para fora do servidor (recomendado). Configure o rclone e descomente:
# rclone copy "$FILE" remoto:delivery-backups/
