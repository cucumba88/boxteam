# Novedades de Oscata

## Versión 0.10.0 — 17 de mayo de 2026

Esta versión añade tres mejoras grandes de navegación y rendimiento sobre la biblioteca, más un pulido importante del modo multi-selección en móvil. La biblioteca de miles de elementos ya no se mueve "a saltos de 48 por página": ahora hay un único scroll infinito con virtualización real, una columna A-Z lateral estilo Plex/iOS para saltar a cualquier letra, y una nueva sección de Preferencias para fijar cómo quieres que arranque cada pestaña.

### ⚙️ Nueva sección de Preferencias en Ajustes

Cada pestaña de la biblioteca arrancaba con valores fijos en el código: `Todo` como pestaña inicial, `Recién añadidos` como orden, `Agrupada` para Películas, `Series` para TV. No había manera de decir "yo siempre quiero entrar en Seguimiento ordenado por valoración". La nueva tarjeta **Preferencias** (entre Apariencia y Perfiles de calidad) cubre cuatro ajustes:

- **Pestaña inicial** — sobre qué tab arranca la app (al volver de un enlace directo de web mode la URL sigue ganando).
- **Orden por defecto por pestaña** — un selector independiente para Todo / Películas / Series / Documentales / Seguimiento, reutilizando las cinco opciones de la barra de filtros.
- **Vista por defecto de Películas** — Agrupada o Archivos.
- **Vista por defecto de Series** — Series o Episodios.

Los ajustes viven en `localStorage` con la clave `oscata.prefs.v1` (mismo patrón que el tema y la sidebar plegada — por dispositivo, no por usuario). El hook `usePrefs` escucha cambios cruzados de pestaña, así que si abres Ajustes en una segunda pestaña del navegador y cambias la pestaña inicial, la primera se actualiza en cuanto cambias de tab. Hay un enlace discreto de "Restablecer valores" al final de la tarjeta.

### 🔠 Columna lateral A-Z para saltar a cualquier letra

Con cientos de películas y orden alfabético, ir a la M significaba antes saltar páginas a mano. Ahora aparece una columna fina de letras en el borde derecho del grid (estilo Plex / Contactos de iOS) cuando el orden es Título A-Z o Z-A. Cada letra es un botón pulsable que lleva el scroll directamente al primer título de esa letra.

- **Buckets por idioma** — el bucket de cada item se calcula con el título que se está mostrando (`getLocalizedTitle`), así que si cambias entre español e inglés todo se reordena en su sitio sin estados intermedios.
- **Letras desactivadas atenuadas** — las letras que no tienen ningún título quedan a ~45% de opacidad y sin eventos de puntero (no se pueden pulsar, no muestran preview). Visibles para que sepas que existen, pero claramente distintas.
- **Letra activa resaltada** — la letra correspondiente al primer item realmente visible (no al de overscan) se ilumina en color primario con un fondo suave. Mientras haces scroll, el resalte sigue tu posición.
- **Pin al hacer clic** — pulsar una letra fija el resalte sobre esa letra hasta que empieces a hacer scroll a mano. Sirve para confirmar visualmente que el salto se ejecutó incluso cuando la fila de aterrizaje empieza con un item de la letra anterior.
- **Preview tipo Plex** — al pasar el cursor sobre una letra activa aparece una píldora grande con esa letra junto al cursor.

### ⚡ Scroll infinito virtualizado en lugar de paginación

`VirtualMediaGrid` por fin hace honor a su nombre: ahora usa `@tanstack/react-virtual` para renderizar sólo las filas visibles (más cuatro de overscan a cada lado). Con bibliotecas de miles de elementos el DOM se mantiene en torno a 8 filas × N columnas independientemente de cuánto bajes; la sensación es la del catálogo de Plex / Emby.

- **Se elimina la paginación** — fuera la barra flotante "Página 1 de N" / botones prev-next, fuera los atajos ⬅/➡ de teclado, fuera el parámetro `?page=N` de la URL. Queda un único scroll continuo.
- **Carga de "badges" por ventana visible** — antes pedíamos los iconos de "ya está en Plex/Emby" para los 48 ítems de la página actual. Ahora se piden sólo para el rango de filas que el virtualizador está renderizando (con un debounce de 150 ms para evitar ráfagas durante el scroll rápido). El `badgeMap` sigue siendo persistente por id: al volver a ver una tarjeta ya cacheada los iconos están ahí sin pedirla otra vez.
- **El A-Z salta a la fila exacta** — el `JumpRequest` pasó de "letra" a "índice de item". El virtualizador hace `scrollToIndex(row, { align: "start" })`, así que no hay flicker de página intermedia.
- **Re-mide al cambiar de tamaño** — un `ResizeObserver` sobre el contenedor recalcula columnas y altura de fila cuando ajustas la ventana; las cartas mantienen la proporción 2:3 del póster.

### 📱 Multi-selección utilizable en móvil

La barra de selección (`N seleccionados` + Seleccionar todo + Corregir match + Cancelar) se desbordaba en 430 px y dejaba "Cancelar" fuera de pantalla. Se reorganiza para móvil:

- El título de la pestaña se reemplaza por el contador (`N seleccionados`) durante la selección, recuperando el espacio que ocupaba.
- Los botones de la toolbar pasan a modo icon-only en móvil — ☑ para Seleccionar todo, ✏ con `(N)` para Corregir match, ✕ para Cancelar. Todos tienen `title` + `aria-label` con el texto completo.
- Mismo tratamiento para la toolbar equivalente del **Seguimiento** (Quitar 🗑 + contador, Cancelar X).
- La casilla de cada tarjeta vive ahora dentro de un wrapper 32×32 con fondo translúcido (mejor target táctil) y `stopPropagation` para que un toque preciso sobre la casilla no dispare a la vez el click de la carta — que provocaba un doble toggle = nada cambia.

### 🪟 FixMatchModal usable en móvil

El modal de "Corregir match" tenía un layout fijo de `280px + 1fr` que en una pantalla de 430 px dejaba 150 px para los resultados. Ahora en móvil el panel lateral (búsqueda + tipo) se apila encima del listado de resultados con un divisor horizontal en vez de vertical.

### 🧹 Bajo el capó

- Extracción de `TabId`, `TABS`, `TAB_SLUGS` a `src/utils/tabs.ts` para que Settings los consuma sin importar de `Library.tsx`.
- `SORT_OPTIONS` ahora se exporta desde `FilterBar` (única fuente de verdad para los dropdowns de orden y la nueva sección de Preferencias).
- Nuevos utilitarios: `src/utils/userPrefs.ts` (lectura/escritura + hook), `src/utils/alphaJump.ts` (`buildAlphaIndex`, `firstCharBucket`, `titleSortKey`).
- Nuevo componente: `src/components/AlphaJumpRail.tsx` (40 LOC, sin dependencias extra).
- Nueva dependencia: `@tanstack/react-virtual` (~3 kB gz).

---

## Versión 0.9.2 — 17 de mayo de 2026

Esta versión cierra cuatro defectos del modo web que quedaron tras el rediseño de v0.9.0 / v0.9.1. Tres son bugs concretos que el usuario reportó; el cuarto es una pulida estructural del shell para que la gestión de usuarios deje de comportarse como un "salida del shell" y pase a ser una página más dentro de la app.

### 🐛 1. "Gestionar usuarios" seguía sin funcionar después del fix de v0.9.1

El parche de v0.9.1 cambió el listener interno del menú de avatar de `mousedown` a `click` — pero `WebRouter` tenía un **segundo** listener de `mousedown` a nivel de documento que cerraba el menú antes de que el botón del portal pudiera procesar su propio `click`. El menú se desmontaba en el mismo tick y la navegación nunca se ejecutaba. Se elimina por completo ese listener externo: `UserMenu` ya gestiona el cierre por click fuera contra los refs del botón y del portal, así que un único handler es suficiente y correcto.

### 🎨 2. Pie de Ajustes ahora ocupa todo el ancho

El pie con los botones "Cancelar / Guardar / Guardar y reindexar" vivía dentro del wrapper centrado de `max-width: 1200`, lo que dejaba la línea divisoria y los botones recortados al ancho del contenido en lugar de extenderse de borde a borde. Se reestructura el layout: el área de scroll y el pie son ahora hermanos a nivel del overlay. El scroll conserva su contenido centrado a 1200px; el pie se estira de borde a borde, igual que la barra superior pegajosa de "Atrás".

### 🔗 3. Ajustes ahora tiene su propia URL: `/ajustes`

Ajustes era la única pestaña sin URL — abrir Ajustes sumaba estado pero no cambiaba la barra de direcciones, lo que hacía imposible enlazarlo o usar el atrás del navegador. Ahora abrir Ajustes hace `pushState('/ajustes')`, cerrar vuelve a la pestaña activa, el `popstate` del navegador sincroniza el overlay, y el escritor de filtros en la URL ignora `/ajustes` (que no tiene estado de filtros propio). Igual de profundo que `/peliculas/<tmdb>` o `/watchlist`.

### 🏠 4. La gestión de usuarios vive ahora dentro del shell

`WebUsers` reemplazaba la app entera — sidebar, barra de estado, header, todo desaparecía y volvías cuando pulsabas "Volver". El usuario apuntó con razón que era una regresión respecto al patrón del resto de páginas (Películas, Seguimiento, Ajustes), que se renderizan como takeover del área de contenido manteniendo el shell visible.

Se reorganiza el render del modo web para que `Library` esté siempre montada y `WebUsers` aparezca como takeover en la misma slot que usa `Settings`:

- `Library` acepta `showUsers` + dos callbacks (`onCloseUsers` para el botón "Volver", `onLeaveUsers` para cuando el usuario navega a otra sección desde la sidebar — éste último no toca el historial porque `switchTab` ya empuja la URL destino).
- `WebUsers` pierde su envoltorio `app-shell-bg` + `minHeight: 100vh` y pasa a ser un `height: 100%` con cuerpo scrollable, igual de profundo que `Settings`. El fallback `NoAccess` recibe el mismo trato.
- `switchTab` ahora cierra Settings + el takeover de usuarios al inicio de la función, así que **todos** los disparadores de cambio de pestaña (sidebar, command palette, barra de tabs móvil, botones de "Ir a Descargas", etc.) salen limpiamente del takeover sin código duplicado por cada llamada.

Antes hacer click en "Películas" desde `/usuarios` solo cambiaba la URL pero la página de usuarios seguía pintada encima — porque la sidebar estaba mutando estado interno de `Library` mientras que la decisión de mostrar `WebUsers` se tomaba en el router externo a partir de su propio estado `page`. Ahora el cambio de pestaña notifica al padre y el takeover se cierra antes de pintar la nueva sección.

---

## Versión 0.9.1 — 17 de mayo de 2026

### 🐛 Fix: el botón "Gestionar usuarios" del menú de avatar no hacía nada

Tras el rediseño del menú del avatar en v0.9.0 (renderizado vía portal para que no lo cortara la sidebar), el botón "Gestionar usuarios" del modo web dejó de navegar. El handler de "click fuera" usaba `mousedown`, que se dispara antes del `click` del propio botón — al pulsar dentro del menú se cerraba el portal en el mismo tick y la navegación nunca se ejecutaba. Se cambia el listener a `click` y se añade `stopPropagation` en el botón del menú para que no haya carrera.

---

## Versión 0.9.0 — 17 de mayo de 2026

### 🎨 Rediseño completo de la interfaz — shell nativo, páginas de detalle, cohesión total

Esta versión es una revisión integral del UX de Oscata. Cada pantalla que toca el usuario se ha reescrito o realineado para que la app se sienta como una aplicación de escritorio cohesionada en lugar de una colección de vistas separadas. Los cambios se ejecutaron como un plan en fases (`UX_REVAMP_PLAN.md`) tras una auditoría completa del código y de cómo se usa hoy.

#### 1. Shell nativo por plataforma

- **macOS**: la barra de título usa `titleBarStyle: Overlay` con `hiddenTitle: true`. Los semáforos (rojo / amarillo / verde) flotan sobre la sidebar y el contenido se extiende hasta el borde, igual que en apps nativas. El sidebar reserva el padding necesario para que los botones no tapen el wordmark.
- **Windows + Linux**: `tauri.windows.conf.json` y `tauri.linux.conf.json` desactivan las decoraciones del sistema. Una franja superior de 36px (`data-tauri-drag-region`) permite arrastrar la ventana, y un nuevo componente `CaptionControls` dibuja minimizar / maximizar / cerrar con los iconos de Lucide y las llamadas correspondientes de `@tauri-apps/api/window`. Las capabilities (`core:window:allow-minimize`, `toggle-maximize`, `close`, `start-dragging`) están abiertas para que esos botones funcionen.
- **Sidebar colapsable** (`240px ↔ 64px`, preferencia persistida en `localStorage`) con dos secciones: **Librería** (Todo / Películas / Series / Documentales / Seguimiento) y **Transferencias** (Descargas / Subidas). En modo colapsado solo se ven los iconos y el botón de Ajustes + avatar comprimido.
- **Barra de estado** inferior (28px) con tres bloques: estado de conexión FTP (verde/ámbar/rojo + host), progreso de indexación, contadores de transferencias activas. El icono de actividad abre el log inline.
- **Command palette** global (`⌘K` en macOS, `Ctrl+K` en Win/Linux). Busca en navegación, acciones (Cambiar idioma, Empezar indexación, Abrir Ajustes, etc.) y los primeros 4.000 títulos de la librería con coincidencia *accent-insensitive* (`foldForSearch`). Flechas + Enter para confirmar, Esc para cerrar.

#### 2. Páginas de detalle como takeover del área de contenido

Antes los detalles abrían como paneles laterales superpuestos al grid. Ahora son **páginas completas** dentro del área de contenido — el sidebar y la barra de estado permanecen visibles, hay un botón "Atrás" con migas de pan, y la página entera tiene scroll natural.

- **`DetailPage`** (películas, 770 líneas): atmósfera con póster desenfocado que aparece con fade-in vía `<img onLoad>`, héroe (póster grande + título grande + año / fecha / rating / calidad / tamaño / géneros), sección de descarga (oculta en vista agrupada — el usuario elige una versión), sinopsis, "Versiones disponibles" con la versión actual marcada, ficha técnica (calidad, codec, HDR, idiomas) y enlaces externos.
- **`TVShowPage`** (series + documentales, ~880 líneas, reemplaza un `TVShowPanel` de 2.082): selector de temporada con chips, **episodios agrupados por release-group dentro de cada temporada**, cada grupo con un botón "Descargar N" propio (en lugar de un único botón ambiguo de "Descargar todo"). Cada grupo se identifica por la carpeta del FTP y se ordena por calidad descendente.
- **`WatchlistDetailPanel` (rediseñado como página)**: misma estructura de héroe, sección de configuración (cobertura por temporada, auto-descarga, perfil de calidad), cobertura de archivos / temporadas, y una "zona de riesgo" con el botón de quitar.
- **`Settings` como página**: se eliminó el modal con backdrop, ahora ocupa el área de contenido como cualquier otra sección. El botón de Ajustes en el sidebar se ilumina cuando estás en la página.
- **URLs deep-linkables** (modo web): `/peliculas/<tmdb>`, `/series/<tmdb>`, `/documentales/<tmdb>`, `/watchlist/<tmdb>`. Recargar la página vuelve a abrir el detalle correcto; back/forward del navegador funciona.

#### 3. Cohesión entre pestañas

Todas las pestañas no-librería (Seguimiento, Descargas, Subidas) tenían su propio `<h1>` + subtítulo + acciones a la derecha — un patrón visual distinto al de Películas/Series/Documentales. Se eliminó esa cabecera bespoke:

- La barra superior de Library (que ya muestra "Seguimiento N titles", "Descargas N titles", etc.) es la única fuente del título.
- Cada pestaña expone un chip-row debajo con el mismo patrón: filtros / chips a la izquierda, acciones primarias a la derecha de la fila del título.
- **Multi-select en Seguimiento** vive ahora en la barra superior de Library, **en el mismo sitio que en Películas/Series/Documentales**. El botón "Agregar" se sitúa a la izquierda de "Seleccionar" para que la acción primaria sea la primera del cluster. La acción masiva es "Quitar (N)" en rojo con confirmación.
- Filtros: nuevo componente `FilterChipRow` (reemplaza el rail lateral de 320px que competía con el sidebar) con búsqueda + ordenamiento + chips de filtros activos + botón "Filtros" que abre un `FilterSheet` (drawer derecho de 380px) bajo demanda.
- Atajos de teclado globales: `Esc` cierra la superficie abierta de mayor prioridad, `/` enfoca la búsqueda.

#### 4. Tarjetas de media menos saturadas

`MediaCard` antes mostraba hasta 6 badges simultáneos (release type, resolución, HDR, codec, descargado, in-Plex, in-Emby) que tapaban el póster. Ahora:

- Tipo de release + resolución se combinan en un solo chip (`WEB-DL · 1080p`).
- El badge de HDR solo aparece para HDR10+ y Dolby Vision (los formatos que realmente justifican un badge).
- El idioma se mueve a la fila de metadatos debajo del póster (`2024 · 7.8 · ES/EN`).
- En hover aparece un botón circular de descarga directa (suprimido en vistas agrupadas donde la acción sería ambigua).
- La fila de metadatos usa truncado con ellipsis en una sola línea — antes se rompía a mitad de palabra cuando había demasiados campos en cards estrechas.

#### 5. Auditoría móvil

Cada superficie se revisó a 430px de ancho:

- **Páginas de detalle** colapsan a una sola columna (héroe vertical, contenido sin sidebar). El padding inferior incluye `env(safe-area-inset-bottom)` + 80px para que la barra de tabs móvil no tape el último contenido.
- **Watchlist**: la grid de 3 columnas hardcodeadas pasó a `repeat(auto-fill, minmax(140px, 1fr))` (las cards a 3 columnas en 430px eran ilegibles). El badge "soup" de cinco chips se redujo a dos.
- **Bug crítico de clipping en detalle de películas**: las versiones disponibles con `whiteSpace: nowrap` hacían que la columna del grid se expandiera más allá del viewport, lo que envolvía la sinopsis a un ancho mayor que el del móvil — y `overflow-x: hidden` cortaba el texto a mitad de palabra en el lado derecho. La solución es `minWidth: 0` en las columnas del grid del cuerpo (las grid columns por defecto tienen `min-width: auto` que impide encoger por debajo del contenido natural).
- Toolbar de Watchlist: input de búsqueda a fila completa en móvil; chips + acciones debajo. Sin overflow ni envoltura rara.

#### 6. Watchlist unificada entre escritorio y web

Antes los watchlists del modo Tauri (user_id=0) y del modo web (`u.id` del usuario logueado) vivían en filas distintas de la misma tabla — el dueño desktop y el admin web veían listas diferentes pese a apuntar al mismo backend. Se cambiaron los cinco handlers HTTP (`get_watchlist`, `add`, `remove`, `update`, `check`) para usar `user_id=0` siempre: una sola "watchlist de la casa", compartida entre todos los usuarios autenticados.

#### 7. Otras superficies pulidas

- **Activity Log**: nuevo botón X explícito (antes solo se podía cerrar volviendo al icono de la barra de estado).
- **WebUsers**: barra superior con back + breadcrumb, tarjetas de acción para Crear / Invitar, lista de usuarios con avatar circular, role pills (Admin / Editor / Usuario), indicador activo/inactivo. Antes era una página de 561 líneas sin chrome ni back button — entrar te dejaba atrapado.
- **Empty states**: el grid vacío ahora muestra un icono + mensaje + CTAs contextuales (`Refrescar librería` / `Abrir ajustes` cuando no hay items, `Limpiar filtros` cuando hay items pero no resultados).
- **Fondo**: se eliminó el grid overlay y el stack de tres gradientes radiales. Ahora hay un solo glow tintado de primary en la esquina superior izquierda fundiéndose con el fondo. Menos ruido, el contenido se lleva la atención.
- **Sidebar footer en un solo row** cuando está expandido: Ajustes + selector de idioma + tema + avatar (web) en una fila horizontal en lugar de tres filas apiladas.

#### 8. Plan de revamp documentado

`UX_REVAMP_PLAN.md` en la raíz captura la auditoría inicial y el plan de 8 fases que guió este trabajo. Las fases 0-7 están entregadas; la fase 8 (rediseño del Wizard de primera ejecución) queda como trabajo futuro.

#### Memoria de cohesión

Tras varios ciclos del usuario pidiendo que reutilizara los patrones existentes (`feedback_ui_cohesion.md`), se interiorizó la regla: **no construir interfaces paralelas para superficies nuevas**. Cada nueva pantalla debe reusar `Library` (toolbar), `FilterChipRow`, `FilterSheet`, `MediaCard`, `DetailPage` y los tokens visuales existentes antes que aproximarlos. Esta versión se hizo con esa regla como restricción.

---

## Versión 0.8.12 — 17 de mayo de 2026

### 🎞️ Detección y selección manual de Dolby Vision (y resto de variantes HDR) en el flujo de subida

Un usuario reportó que el formato Dolby Vision ni se detectaba ni se podía seleccionar a mano al subir un archivo. Una auditoría del flujo de subida confirmó el bug y reveló que era más amplio:

1. **ffprobe nunca detectaba DV.** El backend solo miraba `color_transfer` (PQ/HLG) y `color_primaries` (BT.2020) — nunca inspeccionaba el `side_data_list` con la entrada `DOVI configuration record`, que es la señal fiable. Un fichero DV se reportaba siempre como `HDR10`, `HDR` o nada.
2. **ffprobe pisaba al parser de nombre.** El modal hacía `info?.hdr ?? sug?.detected_hdr`, así que cuando ffprobe devolvía `HDR10` la pista `DV` que el parser extraía del nombre se descartaba en silencio. Un `*.HDR10.DV.mkv` aparecía como `HDR10`.
3. **El modo "temporada completa" no tenía siquiera selector de HDR.** Al subir una carpeta de temporada solo se ofrecían Fuente / Resolución / Códec / Audio, por lo que DV no podía ni detectarse ni introducirse manualmente, y no entraba nunca en los nombres de los episodios renombrados.
4. **Selectores frágiles.** El desplegable de HDR del modo "archivo único" solo aceptaba valores exactos: si ffprobe o el parser devolvían `"DOLBYVISION"` (en mayúsculas, sin espacio) el campo caía a "—". No existía la opción combinada `HDR10 + Dolby Vision`. El desplegable de códec de audio del builder de nombres tampoco incluía `EAC3 + Atmos`, que sí estaba en el del modo temporada.

#### Cambios aplicados

- **Backend (`detect_hdr` en `analysis.rs`).** Ahora deserializa `side_data_list` de cada stream de vídeo y combina las señales: PQ + DOVI → `HDR10+DV`, BT.2020 + DOVI → `HDR+DV`, DOVI sin transferencia HDR → `DV`. También detecta HDR10+ vía la entrada SMPTE 2094‑40 del mismo `side_data_list`. Devuelve uno de: `DV`, `HDR10+DV`, `HDR+DV`, `HDR10+`, `HDR10`, `HLG`, `HDR`, o nada (SDR).
- **Backend (parser de nombres en `parser.rs`).** Antes el parser devolvía solo el primer token HDR que encontraba (`HDR_RE.find`). Ahora `combine_hdr_from` recorre todos los matches, reconoce `Dolby Vision` / `Dolby.Vision` / `DV`, y los combina con el mismo criterio que ffprobe: un fichero llamado `Inception.2010.2160p.UHD.BluRay.DV.HDR10.DTS-HD.MA-REMUX.mkv` ahora devuelve `HDR10+DV` en lugar de solo `DV`.
- **Frontend (`UploadPrepareModal`).** Se sustituye el `??` por `mergeHdr(info?.hdr, sug?.detected_hdr)` para que ninguna de las dos fuentes pueda eclipsar a la otra: si ffprobe ve HDR10 y el parser ve DV el resultado final es `HDR10+DV`.
- **Frontend (selector HDR en modo temporada).** El grid de Fuente / Resolución / Códec en `AnalysisRow` pasa de 3 a 4 columnas e incluye un nuevo selector HDR. El estado `seasonHdr` se siembra con `mergeHdr` y se actualiza cuando llegan datos del ffprobe principal, del primer episodio probado o del análisis por nombre de fichero (cuando ffprobe no está disponible). `buildEpisodeFilename` ahora acepta `hdr` como parámetro y emite los tokens `HDR10`, `HDR`, etc. más un sufijo `DV` cuando corresponde, en cada episodio renombrado.
- **Frontend (selectores tolerantes).** Todos los desplegables relevantes (Fuente / Resolución / Códec / HDR / Audio) añaden automáticamente una opción extra cuando el valor sembrado por ffprobe o el parser no coincide con ninguno del listado canónico, de modo que un token desconocido nunca se descarta en silencio. El listado de HDR gana `HDR10 + Dolby Vision`, y el de audio gana `EAC3 + Atmos` (antes solo lo tenía la rama de temporada).
- **Refactor: módulo `src/features/uploads/quality.ts`.** Se centralizan las enumeraciones (`SOURCE_OPTIONS`, `RESOLUTIONS`, `CODECS`, `AUDIO_CODECS`, `HDR_OPTIONS`) y los helpers (`normalizeHdr`, `mergeHdr`, `hdrFilenameToken`, `isDV`, `mapReleaseType`, `normalizeResolution`, `parseQualityFromFilename`, `formatChannels`) que antes vivían duplicados en `FilenameBuilder.tsx` y `AnalysisRow.tsx`. Una sola fuente de verdad evita que las dos pantallas vuelvan a divergir.

#### Reglas de detección consolidadas

```
side_data_list contiene "DOVI configuration record"     → DV
color_transfer == "smpte2084"                           → HDR10
color_transfer == "smpte2084" + SMPTE 2094-40 side data → HDR10+
color_transfer == "arib-std-b67"                        → HLG
color_primaries == "bt2020" (y ninguna de las anteriores) → HDR
DV + HDR10  → HDR10+DV
DV + HDR    → HDR+DV
DV solo     → DV
```

Cobertura de tests: 7 nuevos tests en `analysis.rs` (SDR, HDR10, HLG, HDR-only, DV-only, HDR10+, HDR10+DV) y 3 nuevos en `parser.rs` (`DV` solo, `Dolby.Vision`, `HDR10+ DV` combinado), más una aserción actualizada en el test existente de Inception que ahora espera `HDR10+DV` en lugar de solo `DV`.

---

## Versión 0.8.11 — 16 de mayo de 2026

### 🐧 Compilación nativa para Linux en GitHub Actions

Hasta ahora cada release publicaba binarios para Windows (NSIS y portable) y una imagen Docker, pero no había artefactos nativos de Linux. El script de instalación headless `scripts/install-debian.sh` ya esperaba un asset `oscata_<versión>_linux_amd64.tar.gz` con el binario, `dist/` y `resources/`, pero nadie lo publicaba, así que la ruta principal del instalador estaba rota desde el primer día y solo funcionaba el fallback de binario suelto, que dejaba fuera la base de datos semilla (`library.seed.db`) y los recursos.

Se añade un nuevo workflow `.github/workflows/build-linux.yml` que se dispara en `push` a `main` y en tags `v*`. Corre sobre `ubuntu-22.04` (fijado a propósito: `ubuntu-latest` está migrando a 24.04, que empaqueta `libwebkit2gtk-4.1` de forma distinta y es una fuente habitual de roturas en CI de Tauri 2). Instala las dependencias de sistema necesarias para compilar (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `rpm`, `libssl-dev`, `build-essential`) y produce cuatro artefactos para arquitectura amd64:

- **`.deb`** para Debian, Ubuntu, Mint y derivadas, instalable con `sudo apt install ./oscata-ftp-client_<versión>_amd64.deb`.
- **`.rpm`** para Fedora, RHEL, CentOS y openSUSE, instalable con `sudo dnf install ./oscata-ftp-client-<versión>-1.x86_64.rpm`.
- **`.AppImage`** universal, ejecutable directamente sin instalación en la mayoría de distros.
- **`oscata_<versión>_linux_amd64.tar.gz`** con el binario, `dist/` y `resources/` empaquetados, que es lo que consume el instalador headless de `install-debian.sh`.

En `push` a `main` los artefactos se suben como artefactos de la run (retención de 30 días). En tags `v*` se adjuntan automáticamente al GitHub Release. No se requiere firma ni certificados: a diferencia de macOS (Apple Developer ID + notarización) o Windows (Authenticode), los `.deb`, `.rpm` y AppImage se instalan sin firma cuando el usuario descarga el archivo directamente. La firma GPG solo es necesaria si se aloja un repositorio apt/yum propio, y aquí no es el caso.

---

## Versión 0.8.10 — 16 de mayo de 2026

### 🔍 Buscador insensible a acentos en biblioteca y seguimiento

El filtro de búsqueda de la pestaña Biblioteca y de la pestaña Seguimiento no encontraba títulos que llevaban tildes u otros diacríticos cuando se escribía sin acentuar. Por ejemplo, escribir «pokemon» no localizaba la entrada guardada como «Pokémon», y al revés tampoco funcionaba si el título estaba almacenado sin tilde. La comparación se hacía con `toLowerCase().includes()` directamente sobre el texto, y en Unicode «é» (U+00E9) y «e» (U+0065) son códigos distintos, por lo que la coincidencia fallaba.

Ahora tanto la consulta como cada campo buscado pasan por una normalización común que descompone el texto en NFD, elimina las marcas combinantes (U+0300–U+036F) y pasa a minúsculas. Así «pokemon», «Pokémon» y «POKÉMON» se reducen a la misma forma comparable y la coincidencia es simétrica en ambas direcciones. La misma normalización se aplica sobre los cinco campos que la biblioteca consulta (`tmdb_title`, `tmdb_title_en`, `title`, `release_group` y `filename`) y sobre el título mostrado en seguimiento.

Como parte del cambio se ha unificado en `src/utils/textSearch.ts` la función de plegado (`foldForSearch`) que ya existía duplicada en dos sitios del código (detección de carpetas en `folderTypes.ts` y detección de palabras clave en el flujo de subida de series), de modo que biblioteca, seguimiento y los flujos de subida usan exactamente la misma regla de normalización.

---

## Versión 0.8.9 — 8 de abril de 2026

### 📣 Notificaciones de Telegram: pistas de audio mejoradas

Cada pista de audio ocupa ahora su propia línea con el icono 🔊, lo que facilita la lectura cuando hay varios idiomas o formatos. Antes todas las pistas iban en una sola línea separadas por «·».

### 📊 Bitrates en formato legible

El bitrate de vídeo aparece en la línea de especificaciones técnicas (📺), entre el códec y el HDR, cuando ffprobe lo detecta. Los valores de 1.000 Kbps o más se muestran en Mbps con un decimal (p. ej. «1080p · AVC · 11.2 Mbps»); por debajo de ese umbral se expresan en Kbps. La misma lógica se aplica al bitrate de cada pista de audio.

---

## Versión 0.8.8 — 8 de abril de 2026

### 🎵 Detección de EAC3 + Atmos con ffprobe

ffprobe codifica el Dolby Digital Plus con Atmos como `eac3` en `codec_name` y añade el perfil `EAC3+JOC` (Joint Object Coding). El analizador ya reconoce ese perfil y lo muestra como **EAC3 + Atmos** tanto en el selector de pistas del modal de subida como en la notificación de Telegram, igual que ya se hacía con TrueHD Atmos.

### 📊 Bitrate de audio en las notificaciones de Telegram

ffprobe extrae el bitrate de cada pista de audio (`bit_rate`) y lo incluye en la notificación junto al códec y la configuración de canales cuando el dato está disponible.

### 🔧 Botón «Probar SMTP» funcional en la app de escritorio

El botón de prueba de SMTP solo funcionaba en la versión web porque la llamada apuntaba exclusivamente al endpoint HTTP del servidor embebido. Ahora existe un comando Tauri nativo (`test_smtp`) que carga la configuración SMTP guardada, busca el primer usuario administrador y le envía un correo de prueba real. Si aún no hay usuarios web configurados, el correo se envía a la dirección del remitente SMTP.

---

## Versión 0.8.7 — 7 de abril de 2026

### 📣 Notificaciones de Telegram más limpias

Se ha eliminado la etiqueta descriptiva que precedía al título en los mensajes de Telegram («🎬 Nueva película», «📺 Nueva serie», etc.). Ahora el título aparece directamente tras el emoji, en negrita y subrayado, lo que le da mayor protagonismo visual sin texto redundante.

---

## Versión 0.8.6 — 7 de abril de 2026

### 🔧 Corregir match TMDB funcional de nuevo en la app de escritorio

Al aplicar un match de TMDB desde la app de escritorio, Tauri devolvía el error «missing required key itemId». La causa era que el modal enviaba el parámetro con la clave `id` en lugar de `itemId`, que es el nombre que Tauri espera al convertir el parámetro Rust `item_id` a camelCase. Corregido tanto en el modal como en la capa de transporte web para que ambas superficies usen la misma clave.

---

## Versión 0.8.5 — 7 de abril de 2026

### ⚡ Scroll de la biblioteca mucho más fluido

El desplazamiento por la cuadrícula de películas y series era lento y los pósteres aparecían en negro al hacer scroll. Dos causas identificadas y corregidas:

- **Badges con `backdrop-filter: blur`:** cada insignia superpuesta sobre los pósteres creaba una capa independiente en la GPU. Con 5-6 badges por tarjeta y 48 tarjetas por página se generaban cientos de capas simultáneas, saturando la memoria de textura y provocando que las imágenes se descargaran de la VRAM y volvieran a verse negras al volver a ellas. Se ha eliminado el filtro de desenfoque y sustituido por un fondo semitransparente con `color-mix`, visualmente idéntico y sin coste en GPU.
- **`loading="lazy"` roto dentro de contenedores con scroll:** el atributo nativo de carga diferida usa la intersección con el _viewport_ del documento, no con el contenedor con `overflow-y: auto`. Las imágenes visibles dentro del panel podían no llegar a pedirse nunca al servidor, dejando el `onLoad` sin disparar y el póster permanentemente en negro. Eliminado el atributo para que el navegador cargue las imágenes directamente.

### 🖼️ Imágenes de póster más ligeras

Las tarjetas tienen un ancho mínimo de 160 px. Se pedían imágenes de 300 px a la CDN de TMDB (el doble del tamaño necesario), duplicando el tiempo de descarga y el consumo de memoria de texturas. Cambiado el tamaño solicitado a `w185`, que es el escalón inmediatamente superior en TMDB y cubre perfectamente la resolución de las tarjetas incluso en pantallas de alta densidad.

### 🧠 Optimizaciones de renderizado en la biblioteca

- Las funciones auxiliares `getAddedTimestamp` y `deduplicateByTitle` se definían dentro del componente, generando nuevas referencias en cada renderizado e invalidando la memoización del listado filtrado. Movidas al ámbito de módulo.
- El mapa de géneros parseado (`parsedGenreMap`) se memoiza ahora sobre la lista de items, eliminando múltiples llamadas a `JSON.parse` por cada interacción con los filtros.
- El ordenamiento usa ahora una transformación de Schwartzian: las claves de ordenación se calculan una sola vez en O(N) antes de comparar, en lugar de recalcularse O(N log N) veces dentro del comparador.
- `VirtualMediaGrid` está ahora envuelto en `memo()` para evitar rerenderizados cuando cambia estado no relacionado del componente padre.

---

## Versión 0.8.4 — 7 de abril de 2026

### 🔗 Rutas de la web SPA devuelven 200 correctamente

Las rutas del cliente React (`/peliculas`, `/series`, etc.) devolvían HTTP 404 aunque la página cargara correctamente gracias a la caché del navegador. El servidor axum usaba `not_found_service`, que fuerza el código 404 en el fallback. Sustituido por `fallback`, que preserva el estado 200 de `index.html`. Las recargas directas y los accesos desde marcadores funcionan ahora sin error de red.

### 📺 Temporadas del seguimiento visibles en la web

Al abrir el panel de detalle de una serie en la lista de seguimiento, la sección de temporadas y episodios mostraba «Sin datos de episodios» porque la ruta de la API `/api/watchlist/{id}/seasons` no estaba registrada en el servidor. Añadida la ruta y el handler correspondiente que consulta TMDB y devuelve la lista completa de temporadas con sus episodios.

### 📱 Panel de seguimiento ya no queda oculto bajo la barra de navegación en móvil

En dispositivos móviles el panel inferior de detalle del seguimiento aparecía cortado por la barra de tabs de la parte inferior de la pantalla. El panel ahora sube `64 px` (más el área segura del sistema) para quedar completamente visible sobre la barra de navegación.

---

## Versión 0.8.3 — 7 de abril de 2026

### ⚡ Refresco en tiempo real de la biblioteca web (WebSocket)

La versión web ya no necesita esperar al siguiente ciclo de sondeo para enterarse de que hay contenido nuevo. Ahora el servidor mantiene una conexión WebSocket con cada pestaña abierta y envía el evento de indexación completada en el instante en que termina. La biblioteca se recarga automáticamente sin que tengas que hacer nada. El sondeo periódico sigue activo como respaldo para recuperar el estado en caso de reconexión.

---

## Versión 0.8.2 — 7 de abril de 2026

### 🔄 Indexación automática funcional en modo sin interfaz (Docker)

El planificador de indexación automática no marcaba correctamente el indicador interno `INDEXING_RUNNING`, lo que hacía que la API `/indexing/status` devolviera siempre `false` aunque hubiera un análisis en curso. Corregido: ahora el flag se activa al inicio del análisis y se desactiva al terminar, tanto en el arranque como en los ciclos periódicos.

### 💤 Descargas y subidas pendientes se reanudan también en modo bandeja

Cuando la ventana principal estaba oculta (app minimizada en la barra de menú o en modo sin interfaz), las descargas pendientes del arranque anterior no se reanudaban porque el código requería una ventana visible. Ahora `resume_pending_downloads` acepta una ventana opcional y funciona correctamente aunque la app esté en segundo plano.

---

## Versión 0.8.1 — 7 de abril de 2026

### 📌 Filtros y paginación persistentes en la URL (web)

En la versión web, los filtros activos (búsqueda, tipo, resolución, HDR, códec, género y orden) y el número de página actual se guardan automáticamente en la barra de direcciones del navegador como parámetros de consulta (`?q=breaking&res=4K&page=2`). Al recargar la página o compartir el enlace, se restaura exactamente la misma vista. Los botones de avanzar y retroceder del navegador también navegan entre los estados de filtrado anteriores.

### 📱 Paginación visible en la PWA (iOS / Android)

La barra de paginación («Anterior · Página X de Y · Siguiente») ya no queda oculta detrás de la barra de navegación inferior en móvil. El panel paginador sube por encima de la barra de pestañas y respeta el área segura del sistema (`safe-area-inset-bottom`) para que no quede tapado por el indicador de inicio de iPhone.

### 🔗 Enlaces externos funcionales en la versión web

Los botones de IMDb y TMDB en el panel de series ya abrían correctamente en la app de escritorio, pero fallaban en Docker/web con el error `Cannot read properties of undefined (reading 'invoke')`. Ahora se usa `window.open` como alternativa cuando la app corre en el navegador.

### 🔐 Flujo de inicio de sesión con OTP corregido

Al verificar el código de un solo uso recibido por correo, la app ya no volvía a llamar a la función de inicio de sesión, lo que enviaba un segundo correo innecesariamente. Ahora el paso de verificación termina correctamente sin reenvíos.

### ✉️ Configuración de TLS para el servidor SMTP

Se añade un selector de modo TLS en la sección de correo electrónico de los ajustes: `STARTTLS` (puerto 587, la mayoría de proveedores) y `TLS implícito` (puerto 465). Antes la app usaba siempre TLS implícito, lo que impedía el envío con Gmail, Outlook y similares. También se incluye un botón «Probar SMTP» que manda un correo de prueba real al usuario activo.

### 🐳 Construcción Docker más rápida (cargo-chef)

El `Dockerfile` adopta la estrategia `cargo-chef` con tres etapas separadas: cálculo del plan de dependencias, compilación de todas las _crates_ de terceros y compilación del código propio. Los cambios en el código fuente de Rust ya no recompilan las dependencias desde cero: la etapa de dependencias se reutiliza desde la caché local de Docker, reduciendo el tiempo de compilación de ~20 minutos a ~2 minutos en cambios habituales.

### 🚀 Publicación automática de imagen Docker en GitHub Actions

Se añade el flujo de trabajo `.github/workflows/build-docker.yml` que construye y publica la imagen en `ghcr.io/cucumba88/oscata` en cada push a `main` y en cada etiqueta de versión. La caché de compilación de Rust se almacena también en el registro para acelerar los runners de CI.

### 📝 Correcciones menores

- Las entradas de formulario en iOS ya no activan el zoom automático (tamaño de fuente mínimo 16 px).
- El modal «Corregir match TMDB» funciona correctamente en la versión web (usaba `invoke` directamente en lugar de la capa de transporte).
- El modo sin cabeza (Docker) muestra un aviso informativo cuando el servidor web ya está activo y oculta el interruptor de activación redundante.

---

## Versión 0.8.0 — 6 de abril de 2026

### 📱 Panel de series rediseñado para móvil

El panel lateral de series tiene ahora un diseño completamente distinto en pantallas pequeñas. En móvil se muestra un encabezado compacto con el póster a la izquierda, el título recortado a tres líneas, el año, la puntuación y los géneros en una sola fila, y las estadísticas como texto en línea (`2 temporadas · 24 episodios`) en lugar de tarjetas grandes. El fondo del encabezado usa el propio póster desenfocado para dar profundidad sin ocupar espacio. La lista de episodios también se adapta: etiqueta compacta (`T01E01`), sin columna de badges ni nombre de archivo. En escritorio el diseño original no cambia.

### 🗺️ Navegación móvil refinada

La barra inferior de pestañas (Todo, Películas, Series, Descargas) funciona con más fiabilidad y muestra los contadores correctamente. Las secciones secundarias (Documentales, Lista de seguimiento, Subidas) se abren desde el menú de tres líneas en la esquina superior derecha. El cajón de filtros se desliza desde el lateral y se cierra solo al tocar fuera. El selector de idioma desaparece en móvil para liberar espacio en el encabezado.

### 🎬 Panel de películas adaptado a móvil

El panel lateral de películas ocupa ahora el ancho completo de la pantalla en móvil, con el póster y los metadatos apilados verticalmente y centrados, en lugar del diseño horizontal de escritorio.

---

## Versión 0.7.7 — 6 de abril de 2026

### ⚡ Subidas más rápidas

Se mejora el rendimiento de las subidas FTP con tres cambios apilados: el tamaño de cada fragmento pasa de 256 KB a 2 MB (menos llamadas asíncronas, mejor uso del buffer TCP), se activa `TCP_NODELAY` en el socket de datos (los fragmentos salen inmediatamente sin esperar a que el sistema acumule más bytes), y la lectura del disco y la escritura en la red se ejecutan en paralelo (mientras el fragmento actual viaja al servidor, el siguiente ya se está leyendo del disco). El progreso visible y el manejo de cancelaciones funcionan igual que antes.

---

## Versión 0.7.6 — 6 de abril de 2026

### 🐛 Subida de archivos ya no se queda bloqueada al 100%

Se corrige un error por el que la barra de progreso llegaba al 100% y se quedaba parada durante un tiempo indeterminado antes de marcar la subida como completada (o no completarla nunca). La causa era que el progreso se calculaba sobre la **lectura del disco** (muy rápida) y no sobre la **transferencia real por FTP**. Ahora se usa streaming directo al servidor: cada fragmento de 256 KB se envía al vuelo y el progreso refleja los bytes realmente transmitidos por red. El 100% ya solo aparece cuando el servidor confirma la transferencia completa. Como beneficio adicional, ya no se almacena el archivo entero en RAM durante la subida.

---

## Versión 0.7.5 — 6 de abril de 2026

### 🎵 Idioma integrado en cada pista de audio

El campo de idioma ya no es un cuadro de texto libre separado. Ahora cada pista de audio incluye su propio selector de idioma (SPA – Español, ENG – Inglés, etc.) con todas las lenguas disponibles en la lista. El idioma queda como primer campo de la fila (`idioma | códec | canales | ×`), el código corto se usa en el nombre del archivo renombrado y el nombre completo sigue llegando a Telegram igual que antes. Los idiomas detectados por ffprobe o por el nombre del archivo se asignan automáticamente a cada pista por posición.

---

## Versión 0.7.4 — 6 de abril de 2026

### 🎵 Pistas de audio en series (multi-track)

El módulo de subidas ahora incluye el selector de pistas de audio en series y episodios, igual que ya existía para películas. Se detectan automáticamente desde ffprobe al analizar el archivo o el primer episodio de la temporada, y se incorporan al nombre del archivo generado (p. ej. `Breaking.Bad.S01E01.WEB-DL.1080p.HEVC.TrueHD.5.1.SPA.ENG.mkv`). El selector permite añadir, editar y eliminar pistas manualmente.

### 🎯 Coincidencia TMDB más precisa por año

La puntuación al buscar en TMDB tiene en cuenta el año del archivo con más fuerza: una coincidencia exacta suma 50 puntos, ±1 año suma 20, una diferencia de 2–3 años penaliza con −10 y más de 3 años con −25. Además, el año detectado en el nombre del archivo se pasa directamente a la búsqueda (sin depender solo del regex sobre la consulta), lo que evita que un título con varias versiones históricas seleccione la versión errónea.

---

## Versión 0.7.3 — 6 de abril de 2026

### 🎵 Códecs de audio detectados con precisión real

Se corrige la detección de EAC3 (Dolby Digital Plus), que antes se mostraba igual que AC3 (Dolby Digital). Además se leen los perfiles que reporta ffprobe para distinguir DTS de DTS-HD MA, DTS:X y DTS-HD HRA, y TrueHD de TrueHD Atmos. El selector de códec de audio se actualiza para incluir todas estas variantes.

### 📁 Selector FTP ya no duplica la carpeta de serie

Al elegir una carpeta de serie existente con el explorador FTP, la ruta se usaba como base y el sistema volvía a añadir la carpeta de temporada encima, generando rutas duplicadas (p. ej. `Tracker (2024) S03/Tracker (2024) S03`). Ahora el explorador detecta si la carpeta seleccionada está al nivel de categoría, de serie o de temporada, y actúa en consecuencia: si ya es una carpeta de serie, se usa directamente como destino final.

### 🔧 Campos de calidad visibles siempre para películas y documentales

El bloque de campos de calidad (resolución, códec, audio, canales, idiomas) ahora se muestra siempre para películas y documentales, independientemente de si el toggle «Renombrar archivo» está activado. Antes desaparecía al desactivar el renombrado.

---

## Versión 0.7.2 — 6 de abril de 2026

### 📣 Notificación Telegram: audio e subtítulos con detalle técnico completo

La línea de audio ahora muestra cada pista por separado con su idioma, códec y configuración de canales (p. ej. «Español TrueHD 7.1 · Inglés AC3 5.1»). Los subtítulos se identifican individualmente e indican las pistas forzadas con «(forzado)». Los datos los extrae ffprobe durante el análisis y viajan hasta la notificación a través de toda la cadena de subida.

### 🗂️ Episodios sueltos ya no aterrizan en «Temporadas completas»

Al subir un episodio individual, la ruta de destino apuntaba a «Temporadas completas» si esa era la única carpeta de categoría presente en el servidor. Ahora la selección es estricta: cada tipo de contenido solo acepta su categoría correcta («Temporadas en emision» para episodios, «Temporadas completas» para temporadas enteras) y crea la carpeta si aún no existe.

### 🎬 Extracción de pistas de subtítulos desde ffprobe

El analizador local detecta y registra todas las pistas de subtítulos del archivo: códec, idioma, si es la pista por defecto y si es forzada. La información viaja hasta el modal de subida, donde el toggle de subtítulos se activa automáticamente cuando se detectan pistas disponibles.

### 🔤 Diccionario de idiomas ampliado

Se añaden los códigos ISO 639-2/B que usa ffprobe (FRE, GER, CHI, DUT, etc.) al diccionario de nombres en español, eliminando códigos sin traducir en notificaciones y etiquetas de la interfaz.

---

## Versión 0.7.1 — 6 de abril de 2026

### 📂 Subidas de series: carpeta de categoría siempre presente

Al seleccionar una carpeta de destino para una serie con el explorador FTP, la subcarpeta de categoría correcta («Temporadas en emision» o «Temporadas Completadas») se mantiene en la ruta y se crea automáticamente en el servidor si aún no existe. Antes, si seleccionabas la carpeta raíz de series manualmente, la categoría desaparecía de la ruta.

### 🗂️ El explorador FTP abre directamente en la carpeta correcta

Para subidas de series, el explorador FTP se abre ahora en la subcarpeta de categoría ya detectada (p. ej. «Temporadas en emision») en lugar de en la raíz del servidor, reduciendo la navegación necesaria.

### 🔧 Detección mejorada de temporada y episodio

Se amplían los formatos de episodio reconocidos en el analizador: `1x05`, `Cap. 03`, `Capitulo 03` y números con cero inicial al principio del nombre de archivo. La detección de temporada dentro de directorios de temporada completa es más robusta y recorre un nivel adicional de subcarpetas cuando es necesario.

### 🎵 Códec de audio y idiomas en subidas

La información de códec de audio e idiomas detectada por ffprobe y el parser se propaga ahora correctamente al trabajo de subida y queda registrada en la base de datos al completarse.

---

## Versión 0.7.0 — 5 de abril de 2026

### 📤 Subidas que sobreviven a un cierre inesperado

Si la app se cierra de golpe o el sistema se apaga mientras hay archivos en cola, Oscata recuerda exactamente qué estaba pendiente y lo retoma solo al volver a abrirla. Las subidas queued o en curso se reanudan automáticamente; los completados, fallidos y cancelados siguen visibles en el historial.

### 🗂️ Vista previa del plan de subida para episodios individuales

Al subir un episodio suelto ahora ves el mismo panel «Plan de subida» que aparece en las temporadas completas: la carpeta de destino y el nombre final del archivo, calculado al momento a partir de los campos de calidad.

### ✏️ Renombrar también en series

El toggle «Renombrar archivo» aparece tanto para episodios individuales como para temporadas completas (antes solo salía en películas). Desactívalo si quieres subir el archivo con su nombre original sin tocar.

### 📣 Notificación Telegram mejorada

La resolución, el códec, los idiomas y el tamaño ahora aparecen justo debajo del título, antes que la valoración y la sinopsis, para que la información técnica sea lo primero que veas.

### 🔒 Ajustes de destinos FTP solo para administradores

En el modo web, la sección de carpetas de destino (películas, series, documentales, reglas por género) solo es visible para usuarios con rol administrador o editor. Los usuarios normales ven el resto de ajustes sin problema.

---

## Versión 0.6.3 — 5 de abril de 2026

### 💼 La versión portátil de Windows ya funciona bien

El ZIP portátil de Windows se ha rehecho para incluir todo lo que necesita Oscata al arrancar. Ahora puedes descomprimirlo, abrir `Oscata.exe` y usar la app sin instalación, con la interfaz cargando bien y la biblioteca guardándose junto al ejecutable.

---

## Versión 0.6.2 — 5 de abril de 2026

### 🗄️ Elige dónde guardar tu biblioteca

Ya puedes decidir en qué carpeta quiere Oscata guardar la base de datos. Tanto en el asistente de configuración inicial como en Ajustes → Almacenamiento encuentras la opción para apuntar a cualquier directorio: un NAS, un disco externo o donde más te convenga. La biblioteca actual se copia sola al nuevo destino (sin perder nada) y Oscata te pide que reinicies para empezar a usarla. Si en algún momento quieres volver a la ubicación por defecto, también puedes restablecerla desde ese mismo apartado.

### 💼 Versión portátil para Windows

Además del instalador NSIS, cada release de GitHub incluye ahora un ZIP portátil para Windows: descomprímelo donde quieras, ejecuta `Oscata.exe` y listo, sin instalación. La biblioteca se guarda junto al ejecutable, así que puedes llevártela en un disco externo.

### 🗑️ Eliminar una descarga borra también el archivo

Al borrar una descarga, Oscata cancela la transferencia activa y elimina el fichero del disco. Sin rastro.

### 🖥️ Aspecto más nativo

Se desactivan el menú contextual del botón derecho y la selección de texto en toda la interfaz, igual que en una app de escritorio. Los campos de formulario mantienen el comportamiento normal para que puedas escribir y editar con comodidad.

---

## Versión 0.6.1 — 5 de abril de 2026

### ⚡ Las descargas automáticas arrancan solas

Hasta ahora, la descarga automática de la lista de seguimiento solo se activaba manualmente. Ahora Oscata lo hace en dos momentos sin que tengas que hacer nada: al terminar el indexado del FTP, y en el momento en que activas la descarga automática en un título. Si el archivo ya estaba indexado, empieza a bajar de inmediato.

---

## Versión 0.6.0 — 5 de abril de 2026

### 📋 Lista de seguimiento

Oscata estrena una pestaña donde apuntas las películas y series que quieres tener. Busca en TMDB, añade lo que te interese y ve de un vistazo qué ya tienes en la biblioteca y qué sigue pendiente. Activa la descarga automática título a título y Oscata se encarga en cuanto aparezca en el FTP.

### ⭐ Perfiles de calidad para la lista de seguimiento

Al añadir un título puedes asignarle un perfil de calidad: resolución mínima y preferida, HDR, códecs y límite de tamaño. Si tienes la descarga automática activada, Oscata lo usará para decidir qué archivos merece la pena bajar y cuáles no.

### 📺 Cuánto tienes de cada serie

Abre el detalle de una serie en tu lista de seguimiento y verás qué temporadas y episodios tienes ya en la biblioteca, con qué calidad, y qué te sigue faltando.

---

## Versión 0.5.5 — 5 de abril de 2026

### 📊 Cuánto falta para enriquecer los metadatos

Mientras Oscata consulta TMDB, ahora puedes ver el avance: barra de progreso, porcentaje y título en curso.

### ⏸️ Oscata te avisa si cierras con descargas en marcha

Si intentas cerrar con descargas activas, Oscata te pregunta antes de salir para que no pierdas ninguna transferencia.

### 📥 Minimizar a la bandeja en lugar de cerrar

En Ajustes puedes hacer que el botón de cierre envíe Oscata a la bandeja en vez de cerrarlo, para que las descargas sigan en segundo plano.

### 🔽 Panel de filtros rediseñado

Las opciones ahora son etiquetas compactas que se resaltan en morado al activarse. Los grupos se pueden plegar y desplegar, e iluminan su título cuando hay filtros activos dentro.

---

## Versión 0.5.4 — 4 de abril de 2026

### 🎯 Tipo de contenido correcto tras el emparejamiento con TMDB

Oscata ahora almacena el tipo de contenido real que devuelve TMDB (película o serie) en lugar del que deduce el parser del nombre de archivo. Esto corrige casos en los que un título quedaba mal categorizado —por ejemplo, indexado como película cuando TMDB lo reconoce como serie, o viceversa—. El emparejamiento automático y la opción «Emparejar de nuevo todo» se benefician de esta mejora.

### 🔒 Modo desarrollo web limitado a localhost

En compilaciones de depuración, el servidor web integrado ahora solo acepta conexiones desde el propio equipo. Esto evita exposiciones accidentales de la interfaz en la red local durante el desarrollo.

---

## Versión 0.5.3 — 4 de abril de 2026

### 🔄 Metadatos de TMDB siempre visibles tras el indexado

Se corrige un problema de sincronización que podía hacer que los metadatos de TMDB (póster, valoración, géneros…) desaparecieran justo al terminar el indexado. Cuando Oscata cargaba la lista actualizada desde la base de datos, en ocasiones llegaba antes de que los datos de TMDB se hubieran escrito en disco, borrando lo que ya había en pantalla. Ahora la lista se fusiona con los datos en memoria, de modo que la información enriquecida permanece visible desde el primer momento.

---

## Versión 0.5.2 — 3 de abril de 2026

### 🎬 Filtro por códec de vídeo

Los filtros de la biblioteca ahora incluyen una sección de códec. Puedes quedarte solo con los títulos en HEVC/H.265, AVC/H.264, AV1 o VP9. Oscata normaliza los valores que venían del parser para que sean consistentes, y los existentes en la base de datos se actualizan automáticamente al arrancar.

### 📦 Tamaño de archivo visible

El peso de cada archivo aparece ahora en la tarjeta, en el panel de detalle y en la vista de lista. Así puedes ver de un vistazo cuánto ocupa cada título antes de descargarlo.

---

## Versión 0.5.1 — 3 de abril de 2026

### 🐛 Corrección: el asistente de configuración fallaba al guardar

Las nuevas opciones de enrutamiento por destino y género que se añadieron en 0.4.0 no tenían valores por defecto en el servidor. Esto hacía que el asistente de configuración fallara al guardar si esos campos no estaban presentes —y en el asistente nunca lo están—. Se han añadido los valores por defecto correspondientes y ahora el guardado funciona correctamente.

---

## Versión 0.5.0 — 3 de abril de 2026

### 📱 Interfaz adaptada a móvil

La versión web de Oscata ahora funciona bien en el móvil. La barra de navegación se convierte en una barra de pestañas fija en la parte inferior, los filtros se abren en un panel deslizante al tocar el botón de embudo, y la barra lateral desaparece para dejar todo el espacio al contenido. Los paneles de detalle y de series ocupan la pantalla completa en pantallas pequeñas.

---

## Versión 0.4.0 — 3 de abril de 2026

### 🎭 Filtrado por géneros

Ya puedes filtrar tu biblioteca por género desde la barra de filtros. Oscata lee los géneros de cada título y te deja quedarte solo con lo que te apetece ver en ese momento.

### ⚙️ Reglas de enrutamiento por género

En Ajustes hay una nueva sección para definir reglas de género. Úsala para que ciertos géneros vayan automáticamente a una biblioteca concreta —por ejemplo, enviar el cine de terror a una carpeta separada de las pelis de acción—. Puedes añadir, editar y eliminar las reglas que quieras.

### 🔄 Refresco de biblioteca más estable

Se ha reescrito la lógica que actualiza la biblioteca al arrancar. Ahora resuelve bien las rutas y no se queda colgado si algo falla durante la carga inicial.

---

## Versión 0.3.0 — 1 de abril de 2026

### 🎨 Modo claro y modo oscuro

En Ajustes encontrarás un selector con tres opciones: oscuro, claro o el predeterminado de tu sistema. El botón de cambio rápido también está disponible en la barra superior, tanto en la app de escritorio como en la versión web.

### 🚀 Indexación mucho más rápida

Hemos mejorado significativamente la velocidad al escanear tu servidor FTP. Las bibliotecas grandes se indexan en mucho menos tiempo. Al terminar, verás un resumen que se cierra automáticamente.

### 🌐 Mejor experiencia en la versión web

La versión web ahora funciona de forma más completa y fiable. Se corrigieron fallos al abrir enlaces, descargar archivos o navegar por los ajustes desde el navegador. La biblioteca se mantiene actualizada automáticamente sin necesidad de recargar la página.

### ✨ Mejoras generales de la interfaz

Pequeños ajustes en la interfaz: mejor espaciado, filtros más coherentes y elementos reorganizados para que todo luzca más limpio y fácil de usar.

---

## Versiones anteriores

Para ver el historial completo de versiones anteriores, consulta el repositorio en GitHub.
