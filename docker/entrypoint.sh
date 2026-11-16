#!/bin/sh
set -e
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "${UPLOAD_DIR:-/data/uploads}" || true
fi
echo "Datenbankmigration…"
npx prisma migrate deploy
if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "Beispieldaten werden angelegt, falls sie noch fehlen…"
else
  echo "Produktivstart ohne Beispielkunden. Administrationskonto kommt aus ADMIN_EMAIL."
fi
npx tsx prisma/seed.ts
echo "Hoch2 Angebote startet auf Port ${PORT:-3000}."
if [ "$(id -u)" = "0" ]; then
  exec gosu node npx next start -H 0.0.0.0 -p "${PORT:-3000}"
fi
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
