#!/usr/bin/env bash
# Sichert Datenbank und hochgeladene Dateien nach ./backups
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$DEST"
USER_NAME="${POSTGRES_USER:-hoch2}"
DB_NAME="${POSTGRES_DB:-hoch2}"

echo "Sichere Datenbank …"
docker compose exec -T db pg_dump -U "$USER_NAME" -d "$DB_NAME" --format=custom > "$DEST/db-$STAMP.dump"

echo "Sichere Dateien …"
docker compose exec -T app tar -C /data -czf - uploads > "$DEST/dateien-$STAMP.tar.gz"

echo "Fertig:"
echo "  $DEST/db-$STAMP.dump"
echo "  $DEST/dateien-$STAMP.tar.gz"
echo "Kopieren Sie den Ordner backups regelmäßig auf einen anderen Datenträger."
