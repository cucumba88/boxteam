# Docker — Oscata sin interfaz gráfica

Instala Oscata como contenedor Docker con la interfaz web activa y sin escritorio. El binario arranca en modo headless: la ventana de escritorio está oculta y el acceso es exclusivamente por el navegador.

## Inicio rápido — imagen publicada

La forma más sencilla es usar la imagen publicada automáticamente en GitHub Container Registry:

```bash
docker run -d \
  --name oscata \
  --restart unless-stopped \
  -p 47860:47860 \
  -v oscata-config:/config \
  -v oscata-downloads:/downloads \
  ghcr.io/cucumba88/oscata:latest
```

La interfaz web queda disponible en `http://localhost:47860`.

## Synology (DS920+ y similares)

El DS920+ lleva un Intel Celeron J4125 (x86_64 / amd64), la misma arquitectura
para la que se publica la imagen oficial, así que arranca de forma **nativa, sin
emulación ni recompilar nada**. Con 20 GB de RAM vas sobradísimo: en modo
headless Oscata consume unos pocos cientos de MB.

Requisitos: **Container Manager** (DSM 7.2+) o el paquete **Docker** (DSM 7.0/7.1).

### Opción A — Container Manager (recomendado, sin SSH)

1. Crea una carpeta compartida `docker` en *Panel de control → Carpeta compartida*.
2. Sube [`docker-compose.synology.yml`](docker-compose.synology.yml) a
   `/volume1/docker/oscata/docker-compose.yml` y ajusta las dos rutas de `volumes`:
   - `/volume1/docker/oscata/config` → datos de la app (DB, config, caché).
   - `/volume1/media` → tu carpeta de descargas/medios real.
3. *Container Manager → Proyecto → Crear*, ruta `/volume1/docker/oscata`, y usa
   ese compose. Arráncalo.
4. Abre `http://IP_DEL_NAS:47860`.

### Opción B — SSH (script de instalación)

1. *Panel de control → Terminal y SNMP → Habilitar servicio SSH*.
2. Copia [`scripts/synology-install.sh`](../scripts/synology-install.sh) al NAS y:

   ```bash
   ssh tu_usuario@IP_DEL_NAS
   sudo CONFIG_DIR=/volume1/docker/oscata/config \
        DOWNLOADS_DIR=/volume1/media \
        bash synology-install.sh
   ```

   El script hace `pull`, crea las carpetas y arranca el contenedor con
   `--restart unless-stopped`. Repite el mismo comando para actualizar a una
   versión nueva (recrea el contenedor reutilizando `/config`).

### Notas Synology

- **Permisos:** el contenedor escribe como `root`, así que los ficheros bajo
  `/downloads` quedan con propietario `root`. En Synology suele ser correcto; si
  accedes a esa carpeta por SMB con otro usuario y necesitas escritura, ajusta
  los permisos de la carpeta compartida en DSM.
- **Puerto:** 47860 no choca con DSM (que usa 5000/5001). Cámbialo en el mapeo
  `-p` o en el compose si lo necesitas.
- **Fijar versión:** en producción sustituye `:latest` por una etiqueta concreta
  (p. ej. `:0.15.9`) para controlar las actualizaciones.

## Construir la imagen localmente

```bash
# Construir
npm run docker:build

# Construir + arrancar
npm run docker:up
```

## docker-compose

Copia el ejemplo y ajusta los puertos y rutas:

```bash
cp docker/docker-compose.example.yml docker-compose.yml
docker compose up -d
```

## Variables de entorno

Solo estas variables se leen del entorno en tiempo de arranque. El resto de la configuración (TMDB, FTP, SMTP, OTP, URL de la app…) se gestiona desde la propia interfaz web en Ajustes.

| Variable                     | Defecto   | Descripción                                      |
| ---------------------------- | --------- | ------------------------------------------------ |
| `OSCATA_WEBGUI_PORT`         | `47860`   | Puerto de escucha interno                        |
| `OSCATA_WEBGUI_HOST`         | `0.0.0.0` | IP de escucha interna                            |
| `OSCATA_WEBGUI_EXPOSED_PORT` | `47860`   | Puerto externo (útil detrás de un proxy inverso) |

`OSCATA_WEBGUI=1` y `OSCATA_HEADLESS=1` ya están definidos en la imagen; no hace falta pasarlos.

## Proxy inverso (nginx / Caddy / Traefik)

Expón el puerto 47860 internamente y mapea el externo mediante `OSCATA_WEBGUI_EXPOSED_PORT`:

```yaml
environment:
  OSCATA_WEBGUI_PORT: "47860"
  OSCATA_WEBGUI_EXPOSED_PORT: "80" # o 443
```

> **Importante:** Oscata usa WebSocket (`/api/ws`) para actualizar la biblioteca en tiempo real. Si usas nginx asegúrate de incluir las cabeceras de upgrade:
>
> ```nginx
> proxy_http_version 1.1;
> proxy_set_header Upgrade $http_upgrade;
> proxy_set_header Connection "upgrade";
> ```
>
> Caddy y Traefik gestionan esto automáticamente sin configuración adicional.

## Datos persistentes

| Ruta en contenedor | Contenido                                  |
| ------------------ | ------------------------------------------ |
| `/config`          | Base de datos SQLite, configuración, caché |
| `/downloads`       | Archivos descargados                       |

## Helper script (desarrollo / autoalojamiento local)

```bash
npm run docker:build    # construye la imagen local
npm run docker:run      # arranca el contenedor (restart: unless-stopped)
npm run docker:up       # build + run en un paso
npm run docker:stop     # para y elimina el contenedor
npm run docker:logs     # muestra los logs en tiempo real
```

Personaliza con un fichero `.env.docker`:

```bash
cp .env.docker.example .env.docker
# Edita .env.docker y luego:
npm run docker:up
```
