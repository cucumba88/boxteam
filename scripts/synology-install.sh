#!/usr/bin/env bash
# Oscata — instalador para Synology DSM (Container Manager / Docker).
#
# Pensado para ejecutarse por SSH directamente en el NAS:
#
#   1. Panel de control → Terminal y SNMP → Habilitar servicio SSH.
#   2. ssh tu_usuario@IP_DEL_NAS
#   3. sudo bash synology-install.sh
#
# Hace pull de la imagen oficial amd64 (nativa en DS920+/J4125), crea las
# carpetas de datos y arranca el contenedor con restart automático.
#
# Personaliza con variables de entorno, por ejemplo:
#   sudo CONFIG_DIR=/volume1/docker/oscata/config \
#        DOWNLOADS_DIR=/volume1/media \
#        WEBGUI_HOST_PORT=47860 \
#        IMAGE=ghcr.io/cucumba88/oscata:latest \
#        bash synology-install.sh
set -Eeuo pipefail

IMAGE="${IMAGE:-ghcr.io/cucumba88/oscata:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-oscata}"
CONFIG_DIR="${CONFIG_DIR:-/volume1/docker/oscata/config}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-/volume1/media}"
WEBGUI_HOST_PORT="${WEBGUI_HOST_PORT:-47860}"
WEBGUI_CONTAINER_PORT="${WEBGUI_CONTAINER_PORT:-47860}"

# DSM trae el binario de docker en varias rutas según la versión / paquete.
find_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo docker
  elif [[ -x /usr/local/bin/docker ]]; then
    echo /usr/local/bin/docker
  else
    echo "[synology] No se encuentra 'docker'. Instala Container Manager (DSM 7.2+) o el paquete Docker." >&2
    exit 1
  fi
}

DOCKER="$(find_docker)"

echo "[synology] Imagen:      ${IMAGE}"
echo "[synology] Config:      ${CONFIG_DIR}  → /config"
echo "[synology] Descargas:   ${DOWNLOADS_DIR}  → /downloads"
echo "[synology] Puerto:      ${WEBGUI_HOST_PORT} → ${WEBGUI_CONTAINER_PORT}"
echo

mkdir -p "${CONFIG_DIR}" "${DOWNLOADS_DIR}"

echo "[synology] Descargando la imagen…"
"${DOCKER}" pull "${IMAGE}"

if "${DOCKER}" ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  echo "[synology] Eliminando contenedor existente ${CONTAINER_NAME}…"
  "${DOCKER}" rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "[synology] Arrancando ${CONTAINER_NAME}…"
"${DOCKER}" run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${WEBGUI_HOST_PORT}:${WEBGUI_CONTAINER_PORT}" \
  -e "OSCATA_WEBGUI_PORT=${WEBGUI_CONTAINER_PORT}" \
  -e "OSCATA_WEBGUI_EXPOSED_PORT=${WEBGUI_HOST_PORT}" \
  -v "${CONFIG_DIR}:/config" \
  -v "${DOWNLOADS_DIR}:/downloads" \
  "${IMAGE}"

sleep 3
echo
"${DOCKER}" ps --filter "name=${CONTAINER_NAME}" --format "  {{.Names}} {{.Image}} {{.Status}}"
echo
echo "[synology] Listo. Abre la interfaz web en:"
echo "  http://$(hostname -i 2>/dev/null | awk '{print $1}'):${WEBGUI_HOST_PORT}"
echo "[synology] Logs:  ${DOCKER} logs -f ${CONTAINER_NAME}"
