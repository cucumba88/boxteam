# BoxTeam

BoxTeam convierte una biblioteca de películas, series y documentales guardada en un **servidor FTP** en algo que se navega como una plataforma de streaming: carátulas, sinopsis y notas de TMDB, filtros por calidad, lista de seguimiento y descargas con un clic.

Funciona como **app de escritorio** (Windows, macOS y Linux) y como **interfaz web** para NAS y servidores con Docker.

📖 **[Wiki de BoxTeam](https://github.com/cucumba88/boxteam/wiki)**: instalación, primeros pasos, Telegram, ajustes, preguntas frecuentes y solución de problemas.

## Descargar

Los instaladores de cada versión están en **[Releases](https://github.com/cucumba88/boxteam/releases/latest)**:

| Sistema | Archivo |
| --- | --- |
| Windows | `BoxTeam_X.Y.Z_x64-setup.exe` (o el `.zip` portable) |
| macOS (Apple Silicon) | `BoxTeam_X.Y.Z_aarch64.dmg` |
| Linux | `.AppImage`, `.deb` o `.rpm` |
| Docker / NAS | `ghcr.io/cucumba88/boxteam:latest` |

La app de macOS no está firmada por Apple y el instalador de Windows no lleva firma de pago: la primera vez hay que permitirlos a mano. Los pasos están en la página [Instalación](https://github.com/cucumba88/boxteam/wiki/Instalación) del wiki.

Desde la **v0.21.0** la app se **actualiza sola** (instalador de Windows, macOS y AppImage). Si vienes de una versión anterior, instala la nueva a mano una vez. Más en [Actualizaciones](https://github.com/cucumba88/boxteam/wiki/Actualizaciones).

## Qué hace

- **Indexa el FTP** al arrancar y cada 15 minutos, y detecta películas, series, documentales, resolución, HDR/Dolby Vision, códecs y tipo de release.
- **Metadatos** de TMDB en español o inglés, con notas opcionales de IMDb (OMDb) y TheTVDB, y plataformas de streaming. Las correcciones manuales se respetan.
- **Búsqueda y filtros** por título, archivo, release group, resolución, códec, HDR, género y plataforma.
- **Descargas** con cola persistente, reanudación, reintentos, hasta 5 a la vez y carpetas de destino ordenadas (A‑Z y reglas por género).
- **Seguimiento** de títulos con auto-descarga según perfiles de calidad.
- **Subidas** al FTP con análisis del archivo (ffprobe) y nombre bien formado, si tu usuario FTP puede escribir.
- **Avisos de Telegram**: anuncio de cada subida en un canal o grupo, y avisos personales de contenido nuevo y descargas terminadas.
- **Interfaz web** con usuarios y roles (administrador, editor, usuario), invitaciones y código por email opcional.
- Comprobación de presencia en **Emby** y **Plex**.
- **Ajustes por bloques** (General, Biblioteca, Conexión, Avisos y Sistema) con buscador, backups y restauración.

## Empezar en dos minutos

1. Instala BoxTeam ([wiki](https://github.com/cucumba88/boxteam/wiki/Instalación)).
2. En el asistente, pon los datos de tu FTP. Si no sabes la ruta raíz, deja **`/`**.
3. Pega tu clave de API de [TMDB](https://www.themoviedb.org/settings/api) (gratis).
4. Elige la carpeta de descargas y listo.

Guía completa: [Primeros pasos](https://github.com/cucumba88/boxteam/wiki/Primeros-pasos).

## Docker

```bash
docker run -d --name boxteam --restart unless-stopped \
  -p 47860:47860 \
  -v boxteam-config:/config \
  -v boxteam-downloads:/downloads \
  ghcr.io/cucumba88/boxteam:latest
```

Abre `http://IP-DEL-SERVIDOR:47860` y crea la cuenta de administrador. La imagen es `linux/amd64`.

- Guía en el wiki: [Docker y NAS](https://github.com/cucumba88/boxteam/wiki/Docker-y-NAS).
- Referencia de variables y proxy inverso: [`docker/README.md`](docker/README.md).
- Synology: [`docker/SYNOLOGY.md`](docker/SYNOLOGY.md) y [`docker/docker-compose.synology.yml`](docker/docker-compose.synology.yml).
- Unraid: [`docker/unraid-template.xml`](docker/unraid-template.xml).

---

## Desarrollo

Tauri 2 · React 19 · TypeScript · Vite · Rust · SQLite (`rusqlite`) · FTP con `suppaftp` · Axum para la interfaz web.

- `src/`: interfaz React (organizada por funcionalidades en `src/features/`).
- `src-tauri/`: backend en Rust (FTP, indexado, descargas, subidas, SQLite, Telegram y servidor web en `src-tauri/src/web/`).
- `scripts/`: publicación, instaladores y utilidades.
- `docker/`: imagen headless con la interfaz web.

Antes de tocar código lee [`.github/copilot-instructions.md`](.github/copilot-instructions.md) (convenciones) y, para cualquier cambio en la web, autenticación o credenciales, [`docs/SECURITY.md`](docs/SECURITY.md).

Requisitos: **Node.js 22**, Rust y los [requisitos de Tauri](https://tauri.app/start/prerequisites/) de tu sistema.

```bash
npm install
npm run tauri dev          # app de escritorio en modo desarrollo
npm run build              # tsc + vite
cargo check --manifest-path src-tauri/Cargo.toml
cd src-tauri && cargo test # tests de Rust
npm test                   # tests del frontend (Vitest)
node --test scripts/*.test.mjs
```

### Publicar una versión

1. `npm run release:patch` (o `:minor` / `:major`): sube la versión en `package.json`, `package-lock.json` y `src-tauri/Cargo.toml` y pasa build, `cargo check` y tests. No hace commit ni tag.
2. Commit, merge a `main` y tag `vX.Y.Z`.
3. El tag lanza `.github/workflows/release.yml`: comprueba la versión, crea la release como borrador, pasa la CI, compila Linux (deb, rpm, AppImage) y Windows (NSIS + zip portable), publica la imagen Docker y `latest.json`, y publica la release. Si algo falla, queda en borrador y basta con relanzar los trabajos fallidos.
4. macOS no se compila en la CI. En un Mac con la clave de firma, en cuanto exista el borrador (mientras la CI compila): `git checkout vX.Y.Z && scripts/release-mac.sh vX.Y.Z`. Sube el `.dmg` y el `.app.tar.gz` con su `.sig`, y así el `latest.json` que se publica ya incluye macOS.

### Actualizaciones de la app

La app usa el updater de Tauri, que lee `https://github.com/cucumba88/boxteam/releases/latest/download/latest.json` (configurado en `src-tauri/tauri.conf.json`). Cada paquete va firmado y la app solo instala los que coinciden con la clave pública de `tauri.conf.json`. La clave privada es el secreto de Actions `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). **Guarda una copia fuera de línea**: si se pierde, las apps instaladas no podrán actualizarse y habrá que reinstalar a mano con una clave nueva.

### Datos locales

La base de datos `library.db` está en la carpeta de datos de la app (`boxteam/` dentro de la carpeta de datos del sistema, `boxteam-data/` junto al ejecutable en el modo portable, o `/config/share/boxteam` en Docker). Cada cambio de versión deja una copia en `backups/`.

## Licencia

Este repositorio aún no tiene archivo de licencia.
