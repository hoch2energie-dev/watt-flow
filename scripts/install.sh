#!/usr/bin/env bash
# Richtet Hoch2 Angebote auf einem frischen Ubuntu 24.04 ein.
# Nicht interaktiv: alle Werte kommen aus der Datei .env im Projektordner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

if [[ ! -f .env ]]; then
  echo "Datei .env fehlt in ${ROOT}."
  echo "cp .env.example .env, Werte eintragen, danach dieses Skript erneut starten."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

require() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "In .env fehlt: ${key}"
    exit 1
  fi
}

require DOMAIN
require ACME_EMAIL
require POSTGRES_PASSWORD
require AUTH_SECRET
require ADMIN_EMAIL
require ADMIN_PASSWORD

if [[ "${SEED_DEMO:-false}" == "true" || "${SEED_DEMO:-false}" == "1" ]]; then
  echo "SEED_DEMO=true ist auf dem Produktivserver nicht erlaubt."
  exit 1
fi
if [[ "${#ADMIN_PASSWORD}" -lt 10 ]]; then
  echo "ADMIN_PASSWORD braucht mindestens 10 Zeichen."
  exit 1
fi
if [[ "${#AUTH_SECRET}" -lt 32 ]]; then
  echo "AUTH_SECRET braucht mindestens 32 Zeichen."
  exit 1
fi
case "${POSTGRES_PASSWORD}" in
  *[@:/#?%$]*|*" "*)
    echo "POSTGRES_PASSWORD darf keine Leerzeichen und keines dieser Zeichen enthalten: @ : / # ? % $"
    exit 1
    ;;
esac
if [[ "${DOMAIN}" == "localhost" || "${DOMAIN}" == "angebote.example.de" || "${DOMAIN}" != *.* ]]; then
  echo "DOMAIN muss der echte Hostname sein, zum Beispiel angebote.hoch2energie.de"
  exit 1
fi

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}

set_env SEED_DEMO false
set_env SHOW_DEMO_LOGIN false
set_env COOKIE_SECURE true

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 ufw
systemctl enable --now docker

ufw allow 22/tcp
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p "${ROOT}/backups"
chmod +x "${ROOT}/scripts/backup.sh" "${ROOT}/scripts/restore.sh" "${ROOT}/docker/entrypoint.sh" "${ROOT}/scripts/install.sh"

CRON_LINE="0 2 * * * cd ${ROOT} && ./scripts/backup.sh >> ${ROOT}/backups/sicherung.log 2>&1"
(crontab -l 2>/dev/null | grep -v "scripts/backup.sh" || true; echo "${CRON_LINE}") | crontab -

docker compose up -d --build
docker compose ps

echo
echo "Stack gestartet. Sobald der DNS-Name ${DOMAIN} auf diesen Server zeigt,"
echo "stellt Caddy das Zertifikat aus. Danach: https://${DOMAIN}"
echo "Anmeldung: ${ADMIN_EMAIL}"
echo "Sicherung täglich um 02:00 Uhr nach ${ROOT}/backups"
