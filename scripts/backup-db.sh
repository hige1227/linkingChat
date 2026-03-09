#!/bin/bash
# Database backup script for LinkingChat
# Add to crontab: 0 3 * * * /opt/linkingchat/scripts/backup-db.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/linkingchat/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-linkingchat-postgres-1}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

docker exec "$CONTAINER_NAME" pg_dump -U linkingchat linkingchat | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

echo "[$(date)] Backup created: db_$TIMESTAMP.sql.gz ($(du -h "$BACKUP_DIR/db_$TIMESTAMP.sql.gz" | cut -f1))"

# Remove backups older than retention period
DELETED=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Removed $DELETED old backup(s)"
fi

echo "[$(date)] Backup complete. Current backups:"
ls -lh "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null || echo "  (none)"
