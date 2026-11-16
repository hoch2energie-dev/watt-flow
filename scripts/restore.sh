#!/usr/bin/env bash
# Stellt eine Sicherung wieder her.
# Aufruf: ./scripts/restore.sh backups/db-DATUM.dump backups/dateien-DATUM.tar.gz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DUMP="${1:-}"
FILES="${2:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Bitte den Pfad zur Datenbank-Sicherung angeben."
  echo "Beispiel: ./scripts/restore.sh backups/db-20261116.dump backups/dateien-20261116.tar.gz"
  exit 1
fi
USER_NAME="${POSTGRES_USER:-hoch2}"
DB_NAME="${POSTGRES_DB:-hoch2}"

echo "Anwendung wird angehalten …"
docker compose stop app caddy
echo "Datenbank wird zurückgespielt …"
docker compose exec -T db pg_restore -U "$USER_NAME" -d "$DB_NAME" --clean --if-exists --no-owner < "$DUMP" || true
if [ -n "$FILES" ] && [ -f "$FILES" ]; then
  echo "Dateien werden zurückgespielt …"
  docker compose run --rm --no-deps --entrypoint tar app -C /data -xzf - < "$FILES"
fi
echo "Anwendung startet wieder …"
docker compose up -d
echo "Wiederherstellung angestoßen. Prüfen Sie die Anmeldung im Browser."
