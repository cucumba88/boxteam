# Docker — BoxTeam sin interfaz gráfica

Instala BoxTeam como contenedor Docker con la interfaz web activa y sin escritorio. El binario arranca en modo headless: la ventana de escritorio está oculta y el acceso es exclusivamente por el navegador.

## Inicio rápido — imagen publicada

La forma más sencilla es usar la imagen publicada automáticamente en GitHub Container Registry:

```bash
docker run -d \
  --name boxteam \
  --restart unless-stopped \
  -p 47860:47860 \
  -v boxteam-config:/config \
  -v boxteam-downloads:/downloads \
  ghcr.io/cucumba88/boxteam:latest
```

La interfaz web queda disponible en `http://localhost:47860`.

## Synology (DS920+ y similares)

El DS920+ lleva un Intel Celeron J4125 (x86_64 / amd64), la misma arquitectura
para la que se publica la imagen oficial, así que arranca de forma **nativa, sin
emulación ni recompilar nada**.

👉 **Guía completa paso a paso:** [`docker/SYNOLOGY.md`](SYNOLOGY.md) — cubre los
cuatro métodos de instalación (Container Manager con Proyecto, contenedor manual,
script SSH y `docker run`), acceso remoto con proxy inverso + WebSocket, permisos,
actualizaciones, copias de seguridad y resolución de problemas.

Atajo rápido (Container Manager, sin SSH): sube
[`docker-compose.synology.yml`](docker-compose.synology.yml) a
`/volume1/docker/boxteam/`, ajusta las dos rutas de `volumes` y créalo como
*Proyecto* en Container Manager. Abre `http://IP_DEL_NAS:47860`.

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
| `BOXTEAM_WEBGUI_PORT`         | `47860`   | Puerto de escucha interno                        |
| `BOXTEAM_WEBGUI_HOST`         | `0.0.0.0` | IP de escucha interna                            |
| `BOXTEAM_WEBGUI_EXPOSED_PORT` | `47860`   | Puerto externo (útil detrás de un proxy inverso) |

`BOXTEAM_WEBGUI=1` y `BOXTEAM_HEADLESS=1` ya están definidos en la imagen; no hace falta pasarlos.

## Proxy inverso (nginx / Caddy / Traefik)

Expón el puerto 47860 internamente y mapea el externo mediante `BOXTEAM_WEBGUI_EXPOSED_PORT`:

```yaml
environment:
  BOXTEAM_WEBGUI_PORT: "47860"
  BOXTEAM_WEBGUI_EXPOSED_PORT: "80" # o 443
```

> **Importante:** BoxTeam usa WebSocket (`/api/ws`) para actualizar la biblioteca en tiempo real. Si usas nginx asegúrate de incluir las cabeceras de upgrade:
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
