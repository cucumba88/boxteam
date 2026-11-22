#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BoxTeam — instalador para Debian/Ubuntu sin entorno gráfico
#
# Instala el binario de BoxTeam, arranca un display virtual mínimo (Xvfb) y
# crea un servicio systemd que enciende la interfaz web automáticamente.
#
# Uso:
#   sudo bash install-debian.sh [--port 47860] [--host 0.0.0.0] [--exposed-port 80] [--version 0.8.0]
#
# Variables de entorno alternativas:
#   BOXTEAM_VERSION   versión a instalar        (por defecto: latest desde GitHub)
#   BOXTEAM_PORT      puerto de escucha (bind)   (por defecto: 47860)
#   BOXTEAM_HOST      IP de escucha              (por defecto: 0.0.0.0)
#   BOXTEAM_DATA_DIR  directorio de datos        (por defecto: /var/lib/boxteam)
#   BOXTEAM_EXPOSED_PORT  puerto externo expuesto (por defecto: igual que BOXTEAM_PORT)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

REPO="cucumba88/oscata-tauri"           # ajusta si el repo cambia de nombre
BIN_NAME="boxteam"
SERVICE_NAME="boxteam"
INSTALL_DIR="/opt/boxteam"
BOXTEAM_PORT="${BOXTEAM_PORT:-47860}"
BOXTEAM_HOST="${BOXTEAM_HOST:-0.0.0.0}"
BOXTEAM_DATA_DIR="${BOXTEAM_DATA_DIR:-/var/lib/boxteam}"
BOXTEAM_VERSION="${BOXTEAM_VERSION:-}"
BOXTEAM_EXPOSED_PORT="${BOXTEAM_EXPOSED_PORT:-}"  # vacío = mismo que BOXTEAM_PORT
DISPLAY_NUM=":99"

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
log()  { printf "${GREEN}[boxteam]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[boxteam]${RESET} %s\n" "$*"; }
die()  { printf "${RED}[boxteam] ERROR:${RESET} %s\n" "$*" >&2; exit 1; }

# ── Args ─────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)          BOXTEAM_PORT="$2";         shift 2 ;;
    --host)          BOXTEAM_HOST="$2";         shift 2 ;;
    --exposed-port)  BOXTEAM_EXPOSED_PORT="$2"; shift 2 ;;
    --version)       BOXTEAM_VERSION="$2";      shift 2 ;;
    --data)          BOXTEAM_DATA_DIR="$2";     shift 2 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

# ── Comprobaciones previas ────────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] || die "Ejecuta el script como root (sudo bash install-debian.sh)"
command -v systemctl >/dev/null 2>&1 || die "Este script requiere systemd"

# Resolver puerto expuesto: por defecto igual al puerto de escucha
BOXTEAM_EXPOSED_PORT="${BOXTEAM_EXPOSED_PORT:-$BOXTEAM_PORT}"

# Detectar arquitectura
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ASSET_ARCH="amd64" ;;
  aarch64) ASSET_ARCH="arm64" ;;
  *) die "Arquitectura no soportada: $ARCH" ;;
esac

# ── Dependencias de sistema ───────────────────────────────────────────────────
log "Instalando dependencias de sistema..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  dbus-x11 \
  jq \
  libasound2 \
  libatk-bridge2.0-0 \
  libayatana-appindicator3-1 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnss3 \
  libssl3 \
  librsvg2-2 \
  libwebkit2gtk-4.1-0 \
  libxss1 \
  sqlite3 \
  xvfb \
  >/dev/null

# ── Resolver versión ─────────────────────────────────────────────────────────
if [[ -z "$BOXTEAM_VERSION" ]]; then
  log "Consultando última versión en GitHub..."
  BOXTEAM_VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | jq -r '.tag_name' | sed 's/^v//')"
  [[ -n "$BOXTEAM_VERSION" ]] || die "No se pudo obtener la versión desde GitHub"
fi
log "Instalando BoxTeam v${BOXTEAM_VERSION}"

# ── Descargar binario ────────────────────────────────────────────────────────
ASSET_URL="https://github.com/${REPO}/releases/download/v${BOXTEAM_VERSION}/boxteam_${BOXTEAM_VERSION}_linux_${ASSET_ARCH}.tar.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "Descargando ${ASSET_URL}..."
ARCHIVE_BIN_NAME="$BIN_NAME"
if ! curl -fsSL "$ASSET_URL" -o "$TMP_DIR/boxteam.tar.gz"; then
  # Versiones anteriores al cambio de nombre publicaban oscata_<ver>_linux_<arch>.tar.gz
  LEGACY_URL="https://github.com/${REPO}/releases/download/v${BOXTEAM_VERSION}/oscata_${BOXTEAM_VERSION}_linux_${ASSET_ARCH}.tar.gz"
  if curl -fsSL "$LEGACY_URL" -o "$TMP_DIR/boxteam.tar.gz"; then
    warn "Usando el paquete con el nombre antiguo (versión previa a BoxTeam)"
    ARCHIVE_BIN_NAME="oscata-tauri"
  fi
fi
if [[ ! -s "$TMP_DIR/boxteam.tar.gz" ]]; then
  # Fallback: intenta sin _linux_, por si el nombre del asset difiere
  ASSET_URL="https://github.com/${REPO}/releases/download/v${BOXTEAM_VERSION}/${BIN_NAME}"
  warn "El archivo tar.gz no se encontró, intentando binario suelto..."
  curl -fsSL "$ASSET_URL" -o "$TMP_DIR/$BIN_NAME" || die "No se pudo descargar el binario desde GitHub"
  chmod +x "$TMP_DIR/$BIN_NAME"
  mkdir -p "$INSTALL_DIR"
  install -m 0755 "$TMP_DIR/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
else
  tar -xzf "$TMP_DIR/boxteam.tar.gz" -C "$TMP_DIR"
  mkdir -p "$INSTALL_DIR"
  # El binario puede estar en la raíz o en un subdirectorio
  BIN_PATH="$(find "$TMP_DIR" -name "$ARCHIVE_BIN_NAME" -type f | head -1)"
  [[ -n "$BIN_PATH" ]] || die "No se encontró el binario '$ARCHIVE_BIN_NAME' dentro del archive"
  install -m 0755 "$BIN_PATH" "$INSTALL_DIR/$BIN_NAME"
  # Copiar assets si existen (dist/, resources/)
  for asset in dist resources; do
    src="$(find "$TMP_DIR" -name "$asset" -maxdepth 3 -type d | head -1)"
    [[ -n "$src" ]] && cp -r "$src" "$INSTALL_DIR/$asset" || true
  done
fi

# ── Migración desde la instalación antigua (Oscata) ──────────────────────────
if [[ -d /var/lib/oscata && ! -e "$BOXTEAM_DATA_DIR" && "$BOXTEAM_DATA_DIR" == "/var/lib/boxteam" ]]; then
  log "Migrando datos de /var/lib/oscata a ${BOXTEAM_DATA_DIR}..."
  systemctl disable --now oscata.service oscata-xvfb.service >/dev/null 2>&1 || true
  mv /var/lib/oscata "$BOXTEAM_DATA_DIR"
  rm -f /etc/systemd/system/oscata.service /etc/systemd/system/oscata-xvfb.service
  systemctl daemon-reload || true
fi

# ── Directorio de datos ───────────────────────────────────────────────────────
mkdir -p "$BOXTEAM_DATA_DIR"
# XDG_DATA_HOME → BoxTeam guarda la BD en $XDG_DATA_HOME/boxteam/library.db
XDG_DATA_HOME="$BOXTEAM_DATA_DIR/share"
XDG_CONFIG_HOME="$BOXTEAM_DATA_DIR/config"
XDG_CACHE_HOME="$BOXTEAM_DATA_DIR/cache"
APP_HOME="$BOXTEAM_DATA_DIR/home"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$APP_HOME"

# ── Servicio Xvfb ────────────────────────────────────────────────────────────
log "Creando servicio systemd para Xvfb (display virtual)..."
cat > /etc/systemd/system/boxteam-xvfb.service << EOF
[Unit]
Description=Xvfb display virtual para BoxTeam
Before=boxteam.service

[Service]
Type=forking
ExecStart=/usr/bin/Xvfb ${DISPLAY_NUM} -screen 0 1x1x8 -ac -nolisten tcp
PIDFile=/tmp/.X99-lock
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# ── Servicio BoxTeam ───────────────────────────────────────────────────────────
log "Creando servicio systemd para BoxTeam..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=BoxTeam Media Library (web UI)
After=network.target boxteam-xvfb.service
Requires=boxteam-xvfb.service

[Service]
Type=simple
Environment=DISPLAY=${DISPLAY_NUM}
Environment=GDK_BACKEND=x11
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=NO_AT_BRIDGE=1
Environment=WEBKIT_DISABLE_COMPOSITING_MODE=1
Environment=HOME=${APP_HOME}
Environment=XDG_DATA_HOME=${XDG_DATA_HOME}
Environment=XDG_CONFIG_HOME=${XDG_CONFIG_HOME}
Environment=XDG_CACHE_HOME=${XDG_CACHE_HOME}
Environment=BOXTEAM_WEBGUI=1
Environment=BOXTEAM_WEBGUI_HOST=${BOXTEAM_HOST}
Environment=BOXTEAM_WEBGUI_PORT=${BOXTEAM_PORT}
Environment=BOXTEAM_WEBGUI_EXPOSED_PORT=${BOXTEAM_EXPOSED_PORT}
Environment=BOXTEAM_HEADLESS=1
ExecStart=${INSTALL_DIR}/${BIN_NAME}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ── Activar e iniciar ─────────────────────────────────────────────────────────
log "Activando servicios..."
systemctl daemon-reload
systemctl enable boxteam-xvfb.service boxteam.service
systemctl restart boxteam-xvfb.service
sleep 1
systemctl restart boxteam.service

log "Esperando que la interfaz web esté disponible..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${BOXTEAM_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if curl -sf "http://127.0.0.1:${BOXTEAM_PORT}/api/health" >/dev/null 2>&1; then
  log ""
  log "✓ BoxTeam instalado y en marcha"
  log "  Web UI → http://$(hostname -I | awk '{print $1}'):${BOXTEAM_EXPOSED_PORT}"
  log "  Datos  → ${BOXTEAM_DATA_DIR}"
  log ""
  log "  Para ver los logs:  journalctl -u boxteam -f"
  log "  Para detenerlo:     systemctl stop boxteam"
else
  warn ""
  warn "El servicio arrancó pero la web UI no responde todavía."
  warn "Comprueba los logs: journalctl -u boxteam -f"
fi
