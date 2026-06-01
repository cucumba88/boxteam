# Oscata en Synology — guía completa

Guía paso a paso para ejecutar Oscata en un NAS Synology (probado con el
**DS920+**, válido para cualquier Synology con CPU Intel). Cubre cuatro métodos
de instalación, acceso remoto con proxy inverso, actualizaciones, copias de
seguridad y resolución de problemas.

> ¿Solo quieres lo mínimo? Salta al [Método 1](#método-1--container-manager-con-proyecto-recomendado).

---

## Índice

1. [Requisitos y compatibilidad](#1-requisitos-y-compatibilidad)
2. [Preparar carpetas y permisos](#2-preparar-carpetas-y-permisos)
3. Métodos de instalación:
   - [Método 1 — Container Manager con Proyecto (recomendado)](#método-1--container-manager-con-proyecto-recomendado)
   - [Método 2 — Container Manager, contenedor manual](#método-2--container-manager-contenedor-manual-registro-ghcrio)
   - [Método 3 — SSH con el script de instalación](#método-3--ssh-con-el-script-de-instalación)
   - [Método 4 — SSH con `docker run` manual](#método-4--ssh-con-docker-run-manual)
4. [Primer arranque](#4-primer-arranque)
5. [Acceso remoto y proxy inverso](#5-acceso-remoto-y-proxy-inverso)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Actualizar Oscata](#7-actualizar-oscata)
8. [Copias de seguridad](#8-copias-de-seguridad)
9. [Resolución de problemas](#9-resolución-de-problemas)

---

## 1. Requisitos y compatibilidad

| Requisito        | Detalle                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **Modelo NAS**   | Cualquier Synology con CPU **Intel/AMD x86_64** (el DS920+ lleva un Intel Celeron J4125). Ver nota ARM ⬇ |
| **DSM**          | **DSM 7.2+** con **Container Manager**, o DSM 7.0/7.1 con el paquete **Docker**                           |
| **RAM**          | 2 GB sobran. Con 20 GB vas holgadísimo: en modo headless Oscata usa unos pocos cientos de MB             |
| **Espacio**      | La imagen ocupa ~1 GB; el resto depende de tu biblioteca (`/config`) y tus descargas (`/downloads`)      |
| **Red**          | Puerto **47860** libre (no choca con DSM, que usa 5000/5001)                                              |

> ⚠️ **Synology ARM no es compatible.** Modelos como DS220j, DS223, DS418 (CPU
> Realtek/ARM) **no** pueden ejecutar esta imagen: solo se publica para
> `linux/amd64`. El DS920+ es Intel, así que arranca de forma **nativa, sin
> emulación ni recompilar nada**. Para saber tu arquitectura: *Panel de control
> → Información del sistema → CPU*, o por SSH `uname -m` (debe decir `x86_64`).

---

## 2. Preparar carpetas y permisos

Decide dos rutas en tu NAS **antes** de instalar:

| Ruta en el NAS (ejemplo)         | Se monta en   | Contenido                                  |
| -------------------------------- | ------------- | ------------------------------------------ |
| `/volume1/docker/oscata/config`  | `/config`     | Base de datos SQLite, configuración, caché |
| `/volume1/media`                 | `/downloads`  | Tus descargas / biblioteca multimedia      |

Pasos en DSM:

1. *Panel de control → Carpeta compartida → Crear*. Crea una carpeta `docker`
   (si no la tienes) → queda en `/volume1/docker`.
2. Dentro, Oscata creará `oscata/config` solo. Puedes pre-crearla con *File
   Station* si lo prefieres.
3. Para `/downloads`, reutiliza tu carpeta de medios existente (por ejemplo una
   carpeta compartida `media` → `/volume1/media`) o crea una nueva.

### Nota importante sobre permisos

El contenedor se ejecuta como **`root`** (lo necesita el servidor gráfico
virtual interno). Por eso **los ficheros que Oscata descargue en `/downloads`
quedan con propietario `root`**. Esto **no** admite las variables `PUID`/`PGID`
de las imágenes estilo *linuxserver.io*.

Consecuencias prácticas:

- **Leer** esos ficheros desde otras apps (Plex, Emby, SMB) funciona sin
  problema: se crean con permisos legibles para todos.
- Si necesitas que **otro usuario escriba o borre** esos ficheros (p. ej. por
  SMB), ajusta los permisos de la carpeta compartida en *Panel de control →
  Carpeta compartida → Editar → Permisos*, o concede permiso de grupo desde
  *File Station → clic derecho → Propiedades → Permiso*.
- No uses `--user` para remapear el UID: el arranque interno (Xvfb) puede fallar
  si las carpetas no están pre-asignadas a ese UID.

---

## Método 1 — Container Manager con Proyecto (recomendado)

La forma más limpia y sin SSH. Container Manager descarga la imagen desde
`ghcr.io` automáticamente al desplegar el proyecto.

1. Sube el fichero [`docker-compose.synology.yml`](docker-compose.synology.yml)
   a tu NAS, por ejemplo a `/volume1/docker/oscata/`, y **renómbralo a
   `docker-compose.yml`** (o pega su contenido en el paso 4).
2. Ajusta dentro del fichero las dos rutas de `volumes` a las que decidiste en
   el [paso 2](#2-preparar-carpetas-y-permisos):
   ```yaml
   volumes:
     - /volume1/docker/oscata/config:/config
     - /volume1/media:/downloads
   ```
3. Abre **Container Manager → Proyecto → Crear**.
4. Rellena:
   - **Nombre del proyecto:** `oscata`
   - **Ruta:** `/volume1/docker/oscata`
   - **Origen:** «Usar docker-compose.yml existente» (si subiste el fichero) o
     «Crear docker-compose.yml» y pega el contenido.
5. Pulsa **Siguiente → Hecho**. Container Manager descargará la imagen y
   arrancará el contenedor. La primera descarga tarda 1–2 minutos.
6. Abre `http://IP_DE_TU_NAS:47860` en el navegador.

**Arranque automático tras reinicio:** ya está cubierto por
`restart: unless-stopped` en el compose.

---

## Método 2 — Container Manager, contenedor manual (registro ghcr.io)

Si prefieres el flujo clásico de «descargar imagen + crear contenedor» en la
interfaz, sin compose:

1. **Añade `ghcr.io` como registro** (la pestaña *Registro* solo busca en Docker
   Hub por defecto): *Container Manager → Registro → Configuración → Añadir →*
   URL `https://ghcr.io`.
2. En *Registro*, busca `cucumba88/oscata`.

   > Si la búsqueda no devuelve resultados (GHCR limita el buscador anónimo),
   > usa el **Método 1 (Proyecto)**, que es más fiable, o descarga la imagen por
   > SSH con `docker pull ghcr.io/cucumba88/oscata:latest` y luego créala desde
   > la pestaña *Imagen*.

3. Descarga la etiqueta `latest`.
4. *Imagen → selecciona la imagen → Ejecutar*:
   - **Red:** `bridge`.
   - **Puerto:** Local `47860` → Contenedor `47860` (TCP).
   - **Volúmenes:** añade
     `/volume1/docker/oscata/config` → `/config` y
     `/volume1/media` → `/downloads`.
   - **Reinicio automático:** actívalo.
5. Aplica y arranca. Web UI en `http://IP_DE_TU_NAS:47860`.

---

## Método 3 — SSH con el script de instalación

Ideal si te manejas con la terminal o quieres automatizar.

1. Activa SSH: *Panel de control → Terminal y SNMP → Habilitar servicio SSH*.
2. Copia [`scripts/synology-install.sh`](../scripts/synology-install.sh) al NAS
   (por SCP, File Station, o pégalo con `vi`).
3. Conéctate y ejecútalo con tus rutas:
   ```bash
   ssh tu_usuario@IP_DE_TU_NAS
   sudo CONFIG_DIR=/volume1/docker/oscata/config \
        DOWNLOADS_DIR=/volume1/media \
        bash synology-install.sh
   ```

El script localiza el binario `docker` de DSM, hace `pull`, crea las carpetas y
arranca el contenedor con `--restart unless-stopped`. **Volver a ejecutar el
mismo comando actualiza** a la última imagen reutilizando `/config`.

Variables que admite (con sus valores por defecto):

```bash
IMAGE=ghcr.io/cucumba88/oscata:latest   # fija una versión: …/oscata:0.15.11
CONTAINER_NAME=oscata
CONFIG_DIR=/volume1/docker/oscata/config
DOWNLOADS_DIR=/volume1/media
WEBGUI_HOST_PORT=47860
WEBGUI_CONTAINER_PORT=47860
```

---

## Método 4 — SSH con `docker run` manual

El control total, sin script. Tras activar SSH (paso 1 del método 3):

```bash
sudo docker pull ghcr.io/cucumba88/oscata:latest

sudo docker run -d \
  --name oscata \
  --restart unless-stopped \
  -p 47860:47860 \
  -e OSCATA_WEBGUI_PORT=47860 \
  -e OSCATA_WEBGUI_EXPOSED_PORT=47860 \
  -v /volume1/docker/oscata/config:/config \
  -v /volume1/media:/downloads \
  ghcr.io/cucumba88/oscata:latest

sudo docker logs -f oscata     # ver el arranque
```

---

## 4. Primer arranque

1. Abre `http://IP_DE_TU_NAS:47860`.
2. La primera vez crearás el **usuario administrador** de la interfaz web.
3. Ve a **Ajustes** y configura, según tu caso:
   - Servidor **FTP** (host, puerto, usuario, contraseña, ruta raíz).
   - Clave de **TMDB** para los metadatos.
   - Carpeta de descargas, descargas simultáneas, mapeo de tipos de carpeta.
   - Conexiones a **Emby** / **Plex** si las usas.

Toda esta configuración vive en `/config` (SQLite), así que sobrevive a
reinicios y actualizaciones del contenedor.

---

## 5. Acceso remoto y proxy inverso

Para entrar desde fuera de casa con HTTPS y un dominio bonito
(`https://oscata.tudominio.com`), usa el **proxy inverso integrado de DSM** en
lugar de abrir el puerto 47860 a Internet.

### 5.1 Crear la regla de proxy inverso

- **DSM 7.2+:** *Panel de control → Portal de inicio de sesión → Avanzado →
  Proxy inverso*.
- **DSM 7.0/7.1:** *Panel de control → Portal de aplicaciones → Proxy inverso*.

Crea una regla:

| Campo                  | Valor                          |
| ---------------------- | ------------------------------ |
| Origen — Protocolo     | HTTPS                          |
| Origen — Nombre host   | `oscata.tudominio.com`         |
| Origen — Puerto        | 443                            |
| Destino — Protocolo    | HTTP                           |
| Destino — Nombre host  | `localhost`                    |
| Destino — Puerto       | 47860                          |

### 5.2 Habilitar WebSocket (¡imprescindible!)

Oscata usa WebSocket (`/api/ws`) para refrescar la biblioteca en tiempo real. En
la misma regla, pestaña **Encabezado personalizado → Crear → WebSocket**. Eso
añade automáticamente las cabeceras `Upgrade` y `Connection`. Sin esto, la app
carga pero no se actualiza sola.

### 5.3 Certificado HTTPS

*Panel de control → Seguridad → Certificado*: añade un certificado Let's Encrypt
para `oscata.tudominio.com` y asígnalo a la regla de proxy inverso. Necesitas un
dominio o un DDNS de Synology (`*.synology.me`) apuntando a tu IP, y el puerto
443 redirigido en tu router.

### 5.4 Bloquear CORS al exponer públicamente

Cuando publicas Oscata en un dominio, **limita los orígenes permitidos** para
que el navegador solo acepte tu dominio. Añade esta variable de entorno al
contenedor (en el compose, o `-e` en `docker run`) y recréalo:

```yaml
environment:
  OSCATA_WEBGUI_PORT: "47860"
  OSCATA_WEBGUI_EXPOSED_PORT: "443"
  OSCATA_WEBGUI_ALLOWED_ORIGINS: "https://oscata.tudominio.com"
```

> Si **no** defines `OSCATA_WEBGUI_ALLOWED_ORIGINS` ni una URL de app en Ajustes,
> CORS queda **abierto** y verás un aviso en los logs. Para uso solo-LAN no pasa
> nada; para acceso público, defínelo siempre.

Como el proxy inverso de DSM corre en el mismo host (`localhost`), la detección
de IP de cliente ya funciona con el valor por defecto de `OSCATA_TRUSTED_PROXIES`
(`127.0.0.1,::1`). Solo tendrás que tocarlo si pones **otro** proxy delante (ver
[tabla de variables](#6-variables-de-entorno)).

---

## 6. Variables de entorno

Solo estas variables se leen al arrancar. **El resto de la configuración** (TMDB,
FTP, SMTP, OTP, URL de la app…) se gestiona desde la propia interfaz web en
*Ajustes* y se guarda en la base de datos, no por variables de entorno.

| Variable                       | Defecto         | Para qué sirve                                                                 |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------- |
| `OSCATA_WEBGUI_PORT`           | `47860`         | Puerto de escucha **interno** del contenedor                                  |
| `OSCATA_WEBGUI_HOST`           | `0.0.0.0`       | IP de escucha interna                                                          |
| `OSCATA_WEBGUI_EXPOSED_PORT`   | `47860`         | Puerto **externo** real (ponlo a `443` detrás de proxy inverso)               |
| `OSCATA_WEBGUI_ALLOWED_ORIGINS`| *(vacío)*       | Orígenes CORS permitidos, separados por comas. Vacío = CORS abierto + aviso   |
| `OSCATA_TRUSTED_PROXIES`       | `127.0.0.1,::1` | IPs de proxys de confianza para leer `X-Forwarded-For` (IP real del cliente)  |

`OSCATA_WEBGUI=1` y `OSCATA_HEADLESS=1` ya vienen fijados en la imagen; no hace
falta pasarlos.

---

## 7. Actualizar Oscata

Al transicionar de versión, el contenedor crea automáticamente una copia de
seguridad de la base de datos en `/config/share/oscata-tauri/backups/` antes de
migrar. Aun así, conviene tener tus propias copias (ver [sección 8](#8-copias-de-seguridad)).

**Según el método usado:**

- **Proyecto (Método 1):** *Container Manager → Proyecto → oscata → Acción →
  Detener*; luego *Imagen → descarga `latest` de nuevo*; y *Proyecto → Compilar*
  / vuelve a desplegar. (Si fijaste una versión en el compose, edita la etiqueta
  primero.)
- **Contenedor manual (Método 2):** *Registro → descarga `latest`*; para el
  contenedor, **acción «Restablecer/Clear»** para recrearlo con la imagen nueva.
- **SSH script (Método 3):** vuelve a ejecutar el mismo comando del script.
- **SSH manual (Método 4):**
  ```bash
  sudo docker pull ghcr.io/cucumba88/oscata:latest
  sudo docker rm -f oscata
  # …y repite el docker run del Método 4
  ```

**Actualizaciones automáticas (opcional):** despliega
[Watchtower](https://containrrr.dev/watchtower/) en tu NAS para que vigile y
actualice el contenedor `oscata` solo. Úsalo con cabeza si prefieres controlar
cuándo se actualiza.

> **Recomendación:** en producción, **fija una versión** (`…/oscata:0.15.11`) en
> vez de `latest` para decidir tú cuándo subes de versión.

---

## 8. Copias de seguridad

Qué respaldar y cómo:

- **`/config` lo es todo.** Contiene la base de datos SQLite con tu biblioteca,
  metadatos, descargas y configuración. Respáldalo y tendrás todo.
- **Hyper Backup / Snapshots:** programa una copia de la carpeta
  `/volume1/docker/oscata/config` con *Hyper Backup* o un snapshot Btrfs.
- **Exportar desde la app:** *Ajustes → exportar base de datos* te da un fichero
  que puedes volver a importar en una instalación limpia.
- **Backups automáticos de versión:** ya se generan en
  `/config/share/oscata-tauri/backups/` en cada cambio de versión.

---

## 9. Resolución de problemas

| Síntoma                                            | Causa probable / solución                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **El contenedor no arranca / se reinicia en bucle** | Mira los logs: `sudo docker logs oscata` (o en Container Manager → contenedor → *Registro*). Suele ser una ruta de volumen inexistente. |
| **«port is already allocated» / 47860 ocupado**   | Otro servicio usa el puerto. Cambia el mapeo a, p. ej., `-p 48860:47860` (o en el compose) y entra por `:48860`.            |
| **No descarga la imagen de `ghcr.io`**            | La pestaña *Registro* no busca GHCR. Usa el **Método 1 (Proyecto)** o `docker pull` por SSH (Método 4).                      |
| **La biblioteca no se actualiza sola** (tras proxy)| Falta el WebSocket en el proxy inverso: añade la cabecera **WebSocket** a la regla (ver [5.2](#52-habilitar-websocket-imprescindible)). |
| **Aviso «CORS is wide open» en los logs**         | Normal en LAN. Si expones a Internet, define `OSCATA_WEBGUI_ALLOWED_ORIGINS` con tu dominio.                                 |
| **Otra app no puede borrar lo descargado**        | Los ficheros son de `root`. Ajusta permisos de la carpeta compartida en DSM (ver [permisos](#nota-importante-sobre-permisos)). |
| **No encuentro `docker` por SSH**                 | Está en `/usr/local/bin/docker`. Usa `sudo` y, si hace falta, la ruta completa.                                             |
| **Quiero empezar de cero**                        | Para y borra el contenedor, y vacía `/volume1/docker/oscata/config`. ⚠️ Eso elimina tu biblioteca y configuración.          |

¿Sigues atascado? Revisa primero los logs del contenedor — casi siempre dicen
exactamente qué falta.
