import type { AppLanguage } from "./mediaLanguage";

const messages = {
  "nav.all": { es: "Todo", en: "All" },
  "nav.movies": { es: "Películas", en: "Movies" },
  "nav.tv": { es: "Series", en: "TV Shows" },
  "nav.docs": { es: "Documentales", en: "Documentaries" },
  "nav.downloads": { es: "Descargas", en: "Downloads" },
  "nav.watchlist": { es: "Seguimiento", en: "Watchlist" },
  "nav.uploads": { es: "Subidas", en: "Uploads" },

  "common.loading": { es: "Cargando…", en: "Loading…" },
  "startup.starting": { es: "Arrancando BoxTeam…", en: "Starting BoxTeam…" },
  "startup.preparingLibrary": { es: "Preparando tu biblioteca…", en: "Getting your library ready…" },
  "startup.preparingLibraryDetail": {
    es: "Leyendo los títulos guardados. Con bibliotecas grandes tarda unos segundos.",
    en: "Reading your saved titles. Large libraries take a few seconds.",
  },
  "startup.loadingSettings": { es: "Cargando tus ajustes…", en: "Loading your settings…" },
  "common.search": { es: "Buscar", en: "Search" },
  "common.clear": { es: "Limpiar", en: "Clear" },
  "common.cancel": { es: "Cancelar", en: "Cancel" },
  "common.close": { es: "Cerrar", en: "Close" },
  "common.save": { es: "Guardar", en: "Save" },
  "common.saved": { es: "Guardado", en: "Saved" },
  "common.saving": { es: "Guardando…", en: "Saving…" },
  "common.refresh": { es: "Actualizar", en: "Refresh" },
  "common.download": { es: "Descargar", en: "Download" },
  "common.browse": { es: "Explorar", en: "Browse" },
  "common.testing": { es: "Probando…", en: "Testing…" },
  "common.connected": { es: "Conectado", en: "Connected" },
  "common.connectionFailed": {
    es: "Falló la conexión",
    en: "Connection failed",
  },
  "common.languageSpanish": { es: "Español", en: "Spanish" },
  "common.languageEnglish": { es: "Inglés", en: "English" },
  "common.all": { es: "Todo", en: "All" },

  "library.shows": { es: "Series", en: "Shows" },
  "library.episodes": { es: "Episodios", en: "Episodes" },
  "library.select": { es: "Seleccionar", en: "Select" },
  "library.selectAll": { es: "Seleccionar todo", en: "Select All" },
  "library.cancel": { es: "Cancelar", en: "Cancel" },
  "library.fixMatch": { es: "Corregir coincidencia", en: "Fix Match" },
  "library.refresh": { es: "Actualizar librería", en: "Refresh Library" },
  "library.refreshShort": { es: "Actualizar", en: "Refresh" },
  "library.refreshHelp": {
    es: "Busca archivos nuevos en el FTP y completa carátulas, notas y plataformas que falten",
    en: "Scans the FTP for new files and fills in missing posters, ratings and platforms",
  },
  "library.refreshing": {
    es: "Actualizando librería…",
    en: "Refreshing library…",
  },
  "library.page": { es: "Página", en: "Page" },
  "library.of": { es: "de", en: "of" },
  "library.prev": { es: "Anterior", en: "Prev" },
  "library.next": { es: "Siguiente", en: "Next" },
  "library.grouped": { es: "Agrupadas", en: "Grouped" },
  "library.files": { es: "Archivos", en: "Files" },
  "library.selectedCount": {
    es: "{count} seleccionados",
    en: "{count} selected",
  },
  "library.selectMultiple": { es: "Seleccionar varios", en: "Select multiple" },
  "library.titlesCount": {
    es: "{count} títulos",
    en: "{count} titles",
  },
  "statusbar.tasksRunning": { es: "{count} tareas en curso", en: "{count} tasks running" },
  "statusbar.tasksTitle": { es: "Tareas en segundo plano", en: "Background tasks" },
  "statusbar.tasksShow": { es: "Ver tareas en curso", en: "Show running tasks" },
  "statusbar.tasksHint": {
    es: "Puedes seguir usando BoxTeam mientras terminan.",
    en: "You can keep using BoxTeam while they finish.",
  },
  "statusbar.activeDownloads": {
    es: "Descargas en curso",
    en: "Active downloads",
  },
  "statusbar.activeUploads": {
    es: "Subidas en curso",
    en: "Active uploads",
  },
  "statusbar.activityLog": {
    es: "Registro de actividad",
    en: "Activity log",
  },
  "transfers.measuringSpeed": {
    es: "Calculando velocidad…",
    en: "Measuring speed…",
  },
  "transfers.stalled": {
    es: "Sin datos del servidor…",
    en: "Waiting for the server…",
  },
  "transfers.preparing": {
    es: "Preparando…",
    en: "Preparing…",
  },
  "transfers.left": { es: "restantes", en: "left" },
  "statusbar.indexedFiles": {
    es: "{count} archivos indexados en total",
    en: "{count} files indexed in total",
  },
  "library.titlesCountOne": {
    es: "1 título",
    en: "1 title",
  },
  "watchlist.allTypes": { es: "Todo", en: "All" },
  "watchlist.movies": { es: "Películas", en: "Movies" },
  "watchlist.tv": { es: "Series", en: "TV" },
  "watchlist.statusAll": { es: "Cualquier estado", en: "Any status" },
  "watchlist.statusPending": { es: "Pendiente", en: "Pending" },
  "watchlist.statusAvailable": { es: "Disponible", en: "Available" },
  "watchlist.remove": { es: "Quitar", en: "Remove" },
  "watchlist.addTitleCta": { es: "Agregar título", en: "Add a title" },
  "watchlist.empty": {
    es: "Tu lista de seguimiento está vacía",
    en: "Your watchlist is empty",
  },
  "uploads.upload": { es: "Subir archivos", en: "Upload files" },
  "uploads.noFtpWrite": {
    es: "Sin permiso de escritura en el FTP",
    en: "No write permission on the FTP server",
  },
  "library.openSettings": { es: "Abrir ajustes", en: "Open Settings" },
  "library.noMediaStarting": {
    es: "Aún no hay nada indexado. Actualiza la librería para escanear el FTP.",
    en: "Nothing indexed yet. Refresh the library to scan the FTP.",
  },
  "library.noResultsFilters": {
    es: "Ningún resultado coincide con los filtros actuales.",
    en: "No results match your filters.",
  },
  "library.noSearchResults": {
    es: "Nada coincide con «{query}».",
    en: "Nothing matches “{query}”.",
  },
  "library.noCategory": {
    es: "No se encontraron {category}. Revisa la configuración de tipos de carpeta.",
    en: "No {category} found. Check your folder type settings.",
  },

  "filter.filters": { es: "Filtros", en: "Filters" },
  "filter.search": { es: "Buscar", en: "Search" },
  "filter.sort": { es: "Orden", en: "Sort" },
  "filter.type": { es: "Tipo", en: "Type" },
  "filter.resolution": { es: "Resolución", en: "Resolution" },
  "filter.codec": { es: "Códec de vídeo", en: "Video codec" },
  "filter.hdr": { es: "HDR", en: "HDR" },
  "filter.active": { es: "{count} activos", en: "{count} active" },
  "filter.browseHint": {
    es: "Explora por calidad o título",
    en: "Browse by quality or title",
  },
  "filter.clear": { es: "Limpiar", en: "Clear" },
  "filter.clearSearch": { es: "Borrar búsqueda", en: "Clear search" },
  "filter.searchPlaceholder": {
    es: "Título, archivo, release group…",
    en: "Title, filename, release group…",
  },
  "filter.sort.releaseDesc": {
    es: "Lanzamiento más reciente",
    en: "Release newest",
  },
  "filter.sort.addedDesc": {
    es: "Agregados recientemente",
    en: "Recently added",
  },
  "filter.sort.ratingDesc": { es: "Mejor valorados", en: "Top rated" },
  "filter.sort.titleAsc": { es: "Título A-Z", en: "Title A-Z" },
  "filter.sort.titleDesc": { es: "Título Z-A", en: "Title Z-A" },
  "filter.sort.releaseAsc": {
    es: "Lanzamiento más antiguo",
    en: "Release oldest",
  },
  "filter.sort.yearDesc": { es: "Año más reciente", en: "Year newest" },
  "filter.sort.yearAsc": { es: "Año más antiguo", en: "Year oldest" },
  "filter.allResolutions": {
    es: "Todas las resoluciones",
    en: "All resolutions",
  },
  "filter.allTypes": { es: "Todos los tipos", en: "All types" },
  "filter.allCodecs": { es: "Todos los codecs", en: "All codecs" },
  "filter.allHdr": { es: "Todo HDR", en: "All HDR" },
  "filter.hdr.dolbyVision": { es: "Dolby Vision", en: "Dolby Vision" },
  "filter.genre": { es: "Género", en: "Genre" },
  "filter.allGenres": { es: "Todos los géneros", en: "All genres" },
  "filter.platform": { es: "Plataforma", en: "Platform" },
  "filter.allPlatforms": { es: "Todas las plataformas", en: "All platforms" },
  "detail.availableOn": { es: "Disponible en", en: "Available on" },

  "detail.details": { es: "Detalles", en: "Details" },
  "detail.fileInfo": { es: "Archivo", en: "File Info" },
  "detail.filename": { es: "Nombre de archivo", en: "Filename" },
  "detail.folder": { es: "Carpeta", en: "Folder" },
  "detail.download": { es: "Descargar", en: "Download" },
  "detail.alreadyDownloaded": { es: "Ya descargado", en: "Already downloaded" },
  "detail.alreadyDownloadedHint": {
    es: "Este archivo exacto ya existe en la carpeta de destino.",
    en: "This exact file already exists in the destination folder.",
  },
  "detail.fixMatch": { es: "Corregir coincidencia", en: "Fix Match" },
  "detail.resolution": { es: "Resolución", en: "Resolution" },
  "detail.videoCodec": { es: "Códec de vídeo", en: "Video Codec" },
  "detail.audio": { es: "Audio", en: "Audio" },
  "detail.size": { es: "Tamaño", en: "Size" },
  "detail.links": { es: "Enlaces", en: "Links" },
  "detail.openTmdb": { es: "Abrir en TMDB", en: "Open in TMDB" },
  "detail.openImdb": { es: "Abrir en IMDb", en: "Open in IMDb" },
  "detail.availableVersions": {
    es: "Versiones disponibles",
    en: "Available Versions",
  },
  "detail.otherVersions": { es: "Otras versiones", en: "Other Versions" },
  "detail.viewFileDetails": { es: "Ver detalle", en: "View details" },
  "detail.genre.action": { es: "Acción", en: "Action" },
  "detail.genre.adventure": { es: "Aventura", en: "Adventure" },
  "detail.genre.animation": { es: "Animación", en: "Animation" },
  "detail.genre.comedy": { es: "Comedia", en: "Comedy" },
  "detail.genre.crime": { es: "Crimen", en: "Crime" },
  "detail.genre.documentary": { es: "Documental", en: "Documentary" },
  "detail.genre.drama": { es: "Drama", en: "Drama" },
  "detail.genre.family": { es: "Familiar", en: "Family" },
  "detail.genre.fantasy": { es: "Fantasía", en: "Fantasy" },
  "detail.genre.history": { es: "Historia", en: "History" },
  "detail.genre.horror": { es: "Terror", en: "Horror" },
  "detail.genre.music": { es: "Música", en: "Music" },
  "detail.genre.mystery": { es: "Misterio", en: "Mystery" },
  "detail.genre.romance": { es: "Romance", en: "Romance" },
  "detail.genre.scifi": { es: "Ciencia ficción", en: "Sci-Fi" },
  "detail.genre.tvmovie": { es: "Película para TV", en: "TV Movie" },
  "detail.genre.thriller": { es: "Thriller", en: "Thriller" },
  "detail.genre.war": { es: "Bélica", en: "War" },
  "detail.genre.western": { es: "Western", en: "Western" },

  "toast.refresh": { es: "Actualización de librería", en: "Library refresh" },
  "toast.indexing": {
    es: "Indexando archivos · {current}/{total}",
    en: "Indexing files · {current}/{total}",
  },
  "toast.enriching": {
    es: "Obteniendo metadatos · {current}/{total}",
    en: "Fetching metadata · {current}/{total}",
  },
  "toast.indexComplete": {
    es: "Indexación completa",
    en: "Indexing complete",
  },
  "toast.newItemsAdded": {
    es: "{count} nuevos",
    en: "{count} new",
  },
  "toast.newItemAdded": {
    es: "1 nuevo",
    en: "1 new",
  },
  "toast.noNewItems": {
    es: "Sin cambios",
    en: "No changes",
  },
  "toast.itemsRemoved": {
    es: "{count} ya no están en el FTP",
    en: "{count} no longer on FTP",
  },
  "toast.itemRemoved": {
    es: "1 ya no está en el FTP",
    en: "1 no longer on FTP",
  },
  "toast.starting": {
    es: "Iniciando indexación…",
    en: "Starting indexing…",
  },
  "toast.scanning": {
    es: "Buscando archivos en el FTP…",
    en: "Scanning FTP folders…",
  },
  "toast.subtitle": {
    es: "Buscando archivos nuevos en FTP y enriqueciendo solo los nuevos",
    en: "Checking FTP for new files and enriching only new items",
  },
  "toast.expand": {
    es: "Mostrar estado de actualización",
    en: "Show refresh status",
  },
  "toast.minimize": {
    es: "Minimizar estado de actualización",
    en: "Minimize refresh status",
  },

  "toast.error.title": {
    es: "No se pudo actualizar la biblioteca",
    en: "Library refresh failed",
  },
  "toast.error.noFiles": {
    es: "El FTP no devolvió ningún archivo de vídeo. Revisa la carpeta raíz en Ajustes.",
    en: "The FTP server returned no video files. Check the root folder in Settings.",
  },
  "toast.error.connection": {
    es: "No se pudo conectar con el servidor FTP. Comprueba que está encendido y que los datos de acceso son correctos.",
    en: "Couldn't reach the FTP server. Check that it is online and that the credentials are right.",
  },
  "toast.error.auth": {
    es: "El servidor FTP rechazó el usuario o la contraseña.",
    en: "The FTP server rejected the username or password.",
  },
  "toast.error.timeout": {
    es: "El servidor FTP tardó demasiado en responder.",
    en: "The FTP server took too long to respond.",
  },
  "toast.error.details": { es: "Detalle técnico", en: "Technical detail" },
  "toast.close": { es: "Cerrar aviso", en: "Close notification" },
  "toast.region": { es: "Avisos", en: "Notifications" },
  "toast.error.retry": { es: "Reintentar", en: "Retry" },
  "toast.error.dismiss": { es: "Descartar", en: "Dismiss" },

  "tv.show": { es: "Serie", en: "TV Show" },
  "tv.seasons": { es: "Temporadas", en: "Seasons" },
  "tv.episodes": { es: "Episodios", en: "Episodes" },
  "tv.groups": { es: "Grupos", en: "Groups" },
  "tv.fixShow": { es: "Corregir coincidencia de la serie", en: "Fix match for show" },
  "tv.fixVisible": {
    es: "Corregir coincidencia de los episodios visibles",
    en: "Fix match for visible episodes",
  },
  "tv.clearShowMetadata": {
    es: "Limpiar metadatos de la serie",
    en: "Clear show metadata",
  },
  "tv.clearingShowMetadata": {
    es: "Limpiando metadatos…",
    en: "Clearing metadata…",
  },
  "tv.unknownFolder": { es: "Desconocido", en: "Unknown" },
  "tv.episode": { es: "Episodio", en: "Episode" },
  "tv.episodeUnknown": { es: "Episodio ?", en: "Episode ?" },
  "tv.seasonLabel": { es: "Temporada {season}", en: "Season {season}" },
  "tv.unknownSeason": { es: "Temporada desconocida", en: "Unknown Season" },
  "tv.downloadEpisode": { es: "Descargar episodio", en: "Download episode" },
  "tv.downloadFolder": { es: "Descargar carpeta", en: "Download folder" },
  "tv.downloadVisible": {
    es: "Descargar episodios visibles",
    en: "Download all visible episodes",
  },
  "tv.filesCount": {
    es: "{count} archivo{suffix}",
    en: "{count} file{suffix}",
  },
  "tv.episodesAndGroups": {
    es: "{episodes} episodio{episodesSuffix} · {groups} grupo{groupsSuffix}",
    en: "{episodes} episode{episodesSuffix} · {groups} release group{groupsSuffix}",
  },
  "tv.downloadSeason": { es: "Descargar temporada", en: "Download season" },
  "tv.source": { es: "Fuente", en: "Source" },
  "tv.quality": { es: "Calidad", en: "Quality" },
  "tv.season": { es: "Temporada", en: "Season" },
  "tv.noEpisodesFilters": {
    es: "Ningún episodio coincide con los filtros actuales.",
    en: "No episodes match the current filters.",
  },
  "tv.close": { es: "Cerrar", en: "Close" },
  "tv.downloadGroup": { es: "Descargar grupo", en: "Download group" },
  "tv.downloadAllVisible": {
    es: "Descargar episodios visibles",
    en: "Download all visible episodes",
  },
  "tv.clearConfirm": {
    es: '¿Limpiar todos los metadatos TMDB de "{title}"? Se volverán a obtener la próxima vez que se rehagan las coincidencias.',
    en: 'Clear all TMDB metadata for "{title}"? It will be re-fetched on next rematch.',
  },

  "modal.fixTmdb": { es: "Corregir coincidencia en TMDB", en: "Fix TMDB match" },
  "modal.searchTarget": { es: "Búsqueda objetivo", en: "Search target" },
  "modal.search": { es: "Buscar", en: "Search" },
  "modal.searching": { es: "Buscando…", en: "Searching…" },
  "modal.movie": { es: "Película", en: "Movie" },
  "modal.doc": { es: "Doc", en: "Doc" },
  "modal.useMatch": { es: "Usar esta coincidencia", en: "Use match" },
  "modal.applying": { es: "Aplicando…", en: "Applying…" },
  "modal.noResults": {
    es: "No se encontraron resultados TMDB para esa búsqueda.",
    en: "No TMDB results found for that search.",
  },
  "modal.matchEditor": { es: "Editor de coincidencia", en: "Match editor" },
  "modal.untitled": { es: "Sin título", en: "Untitled" },
  "modal.applyOne": { es: "Aplicar a 1 archivo", en: "Apply to 1 file" },
  "modal.applyMany": {
    es: "Aplicar a {count} archivos",
    en: "Apply to {count} files",
  },
  "modal.type": { es: "Tipo", en: "Type" },
  "modal.documentary": { es: "Documental", en: "Documentary" },
  "modal.searchPlaceholder": {
    es: "Buscar título TMDB…",
    en: "Search TMDB title…",
  },
  "modal.emptyTitle": {
    es: "Busca en TMDB para elegir la coincidencia correcta",
    en: "Search TMDB to choose the correct match",
  },
  "modal.emptyBody": {
    es: "Usa la búsqueda de arriba y selecciona el mejor resultado. La coincidencia elegida se aplicará a todos los archivos de este alcance.",
    en: "Use the title search above, then pick the best result. The selected match will be applied to every file in this scope.",
  },
  "modal.rating": { es: "Puntuación {rating}", en: "Rating {rating}" },

  "downloads.queued": { es: "En cola", en: "Queued" },
  "downloads.downloading": { es: "Descargando", en: "Downloading…" },
  "downloads.done": { es: "Completada", en: "Done" },
  "downloads.error": { es: "Error", en: "Error" },
  "downloads.cancelled": { es: "Cancelada", en: "Cancelled" },
  "downloads.toastQueuedTitle": {
    es: "Descarga añadida",
    en: "Download queued",
  },
  "downloads.toastQueuedManyTitle": {
    es: "{count} descargas añadidas",
    en: "{count} downloads queued",
  },
  "downloads.toastQueuedBody": {
    es: "Ya está en la cola de descargas.",
    en: "It's in the download queue.",
  },
  "downloads.toastQueuedManyBody": {
    es: "Ya están en la cola de descargas.",
    en: "They're in the download queue.",
  },
  "downloads.toastGoToDownloads": {
    es: "Ver descargas →",
    en: "View downloads →",
  },
  "downloads.toastErrorTitle": {
    es: "No se pudo añadir la descarga",
    en: "Couldn't queue the download",
  },
  "downloads.toastErrorBody": {
    es: "Inténtalo de nuevo en unos segundos.",
    en: "Try again in a few seconds.",
  },
  "downloads.subtitle": {
    es: "Sigue el estado de las descargas, reintenta fallos y abre el contenido completado desde un solo lugar.",
    en: "Track download progress, retry failures, and open completed items from one place.",
  },
  "downloads.cancel": { es: "Cancelar", en: "Cancel" },
  "downloads.retry": { es: "Reintentar", en: "Retry" },
  "downloads.openFolder": { es: "Abrir carpeta", en: "Open folder" },
  "downloads.delete": { es: "Eliminar", en: "Delete" },
  "downloads.waiting": { es: "Esperando en cola…", en: "Waiting in queue…" },
  "downloads.none": { es: "Todavía no hay descargas", en: "No downloads yet" },
  "downloads.emptyTitle": {
    es: "Todavía no hay descargas",
    en: "No downloads yet",
  },
  "downloads.emptyBody": {
    es: "Cuando envíes contenido a descargar, lo verás aquí con progreso, acciones rápidas y estado de reanudación.",
    en: "When you queue content for download, it will appear here with progress, quick actions, and resume status.",
  },
  "downloads.activeSection": { es: "En curso", en: "In progress" },
  "downloads.activeSectionBody": {
    es: "Descargas activas y elementos esperando su turno.",
    en: "Active downloads and items waiting for their turn.",
  },
  "downloads.historySection": {
    es: "Historial reciente",
    en: "Recent history",
  },
  "downloads.historySectionBody": {
    es: "Completadas, canceladas o con error, con acciones para continuar.",
    en: "Completed, cancelled, or failed items with actions to continue.",
  },
  "downloads.noActive": {
    es: "No hay descargas activas en este momento.",
    en: "There are no active downloads right now.",
  },
  "downloads.noHistory": {
    es: "Todavía no hay historial de descargas.",
    en: "There is no download history yet.",
  },
  "downloads.clearCompleted": {
    es: "Limpiar historial",
    en: "Clear history",
  },
  "downloads.downloadingCount": {
    es: "{count} descargando",
    en: "{count} downloading",
  },
  "downloads.queuedCount": { es: "{count} en cola", en: "{count} queued" },
  "downloads.doneCount": { es: "{count} completadas", en: "{count} done" },
  "downloads.failedCount": { es: "{count} fallidas", en: "{count} failed" },
  "downloads.secondsLeft": { es: "{count}s restantes", en: "{count}s left" },
  "downloads.minutesLeft": {
    es: "{minutes}m {seconds}s restantes",
    en: "{minutes}m {seconds}s left",
  },
  "downloads.hoursLeft": { es: "{hours}h restantes", en: "{hours}h left" },

  "activity.title": {
    es: "Actividad · {count} entradas",
    en: "Activity Log · {count} entries",
  },
  "activity.clear": { es: "Limpiar", en: "Clear" },
  "activity.connectedCrawl": {
    es: "Conectado — iniciando exploración desde {root}",
    en: "Connected — starting crawl from {root}",
  },
  "activity.crawlComplete": {
    es: "Exploración completada — {count} archivos encontrados",
    en: "Crawl complete — {count} media files found",
  },
  "activity.scanning": { es: "📂 Escaneando {path}", en: "📂 Scanning {path}" },
  "activity.found": { es: "🎬 Encontrado: {name}", en: "🎬 Found: {name}" },
  "activity.rematching": {
    es: "🔄 Rehaciendo coincidencias de {count} elementos con TMDB…",
    en: "🔄 Re-matching {count} items with TMDB…",
  },
  "activity.matching": {
    es: "🌐 [{current}/{total}] Buscando coincidencia: {title} ({type})",
    en: "🌐 [{current}/{total}] Matching: {title} ({type})",
  },
  "activity.matched": {
    es: "✓ Coincidencia: {from} → {to} ({year})",
    en: "✓ Matched: {from} → {to} ({year})",
  },
  "activity.noMatch": {
    es: "⚠ No se encontró coincidencia para: {title}",
    en: "⚠ No match found for: {title}",
  },
  "activity.rematchComplete": {
    es: "✓ Coincidencias rehechas: {count} elementos procesados",
    en: "✓ Re-match complete — {count} items processed",
  },
  "activity.doneIndexed": {
    es: "✓ Listo — {count} archivos indexados",
    en: "✓ Done — {count} files indexed",
  },
  "activity.error": { es: "⚠ Error: {message}", en: "⚠ Error: {message}" },
  "activity.indexingStarted": {
    es: "▶ Indexado iniciado",
    en: "▶ Indexing started",
  },

  "router.loading": { es: "Cargando…", en: "Loading…" },

  "wizard.stepFtp": { es: "Servidor FTP", en: "FTP Server" },
  "wizard.stepTmdb": { es: "Metadatos (TMDB)", en: "Metadata (TMDB)" },
  "wizard.stepTmdbDesc": {
    es: "Valida tu API key de TMDB para traer carátulas, sinopsis y notas, y elige el idioma de la biblioteca.",
    en: "Validate your TMDB API key to fetch posters, synopses and ratings, and pick the library language.",
  },
  "wizard.tmdbShort": { es: "TMDB", en: "TMDB" },
  "wizard.rootPathHelp": {
    es: "Carpeta del FTP donde están tus películas y series. Las subcarpetas se clasifican automáticamente.",
    en: "FTP folder that holds your movies and shows. Subfolders are classified automatically.",
  },
  "wizard.retestNeeded": {
    es: "Datos cambiados: vuelve a probar.",
    en: "Details changed: test again.",
  },
  "wizard.ftpErrorRefused": {
    es: "El servidor ha rechazado la conexión. Revisa el host y el puerto, y que el FTP esté encendido.",
    en: "The server refused the connection. Check host and port, and that the FTP server is running.",
  },
  "wizard.ftpErrorTimeout": {
    es: "El servidor no responde. Revisa el host, el puerto y tu red.",
    en: "The server is not responding. Check host, port and your network.",
  },
  "wizard.ftpErrorHost": {
    es: "No se encuentra ese host. Revisa que esté bien escrito.",
    en: "That host could not be found. Check the spelling.",
  },
  "wizard.ftpErrorAuth": {
    es: "Usuario o contraseña incorrectos.",
    en: "Wrong username or password.",
  },
  "wizard.ftpErrorTls": {
    es: "Fallo al negociar FTPS. Prueba a desactivar FTPS o a aceptar certificados no válidos.",
    en: "FTPS negotiation failed. Try disabling FTPS or accepting invalid certificates.",
  },
  "wizard.ftpErrorDetail": { es: "Detalle técnico", en: "Technical detail" },
  "wizard.downloadFolderHelp": {
    es: "Carpeta de tu ordenador donde se guardarán las descargas. Puedes cambiarla luego en Ajustes.",
    en: "Folder on this computer where downloads are saved. You can change it later in Settings.",
  },
  "wizard.stepOf": { es: "Paso {n} de {total}", en: "Step {n} of {total}" },
  "wizard.progressLabel": { es: "Progreso de la configuración", en: "Setup progress" },
  "wizard.skipForNow": { es: "Omitir por ahora", en: "Skip for now" },
  "wizard.stepDownloadsDesc": {
    es: "Elige dónde se guardan los archivos que descargues y cuántos a la vez.",
    en: "Choose where downloaded files are saved and how many run at once.",
  },
  "wizard.edit": { es: "Cambiar", en: "Change" },
  "wizard.downloadFolderUnset": {
    es: "Sin elegir: te la pediremos en Ajustes",
    en: "Not set: you can choose it in Settings",
  },
  "wizard.stepConfirm": { es: "Confirmar", en: "Confirm" },
  "wizard.stepDataDir": { es: "Almacenamiento", en: "Storage" },
  "wizard.dataDir": {
    es: "Ubicación de la base de datos",
    en: "Database location",
  },
  "wizard.dataDirDesc": {
    es: "Elige dónde guardar la biblioteca. Por defecto se usa la carpeta de datos de la aplicación.",
    en: "Choose where to store the library. The app data folder is used by default.",
  },
  "wizard.dataDirPick": {
    es: "Elige una carpeta…",
    en: "Choose a folder…",
  },
  "wizard.dataDirHint": {
    es: "Aquí se guardan la base de datos de la biblioteca y sus copias de seguridad, no tus películas. Útil si quieres tenerla en otro disco o sincronizada.",
    en: "This holds the library database and its backups, not your media. Handy if you want it on another drive or synced.",
  },
  "wizard.dataDirDefault": {
    es: "Usar ubicación predeterminada",
    en: "Use default location",
  },
  "wizard.next": { es: "Siguiente →", en: "Next →" },
  "wizard.host": { es: "Host", en: "Host" },
  "wizard.port": { es: "Puerto", en: "Port" },
  "wizard.username": { es: "Usuario", en: "Username" },
  "wizard.password": { es: "Contraseña", en: "Password" },
  "wizard.rootPath": { es: "Ruta raíz", en: "Root Path" },
  "wizard.testConnection": { es: "Probar conexión", en: "Test Connection" },
  "wizard.failedCredentials": {
    es: "Falló — revisa host/credenciales",
    en: "Failed — check host/credentials",
  },
  "wizard.tmdbHelp": {
    es: "Consigue tu API key gratis en",
    en: "Get your free API key at",
  },
  "wizard.tmdbKey": { es: "TMDB API Key (v3)", en: "TMDB API Key (v3)" },
  "wizard.tmdbPlaceholder": {
    es: "Pega tu API key v3",
    en: "Paste your v3 API key",
  },
  "wizard.validateKey": { es: "Validar key", en: "Test Key" },
  "wizard.validating": { es: "Validando…", en: "Validating…" },
  "wizard.validKey": { es: "La key es válida", en: "Key is valid" },
  "wizard.invalidKey": { es: "La key no es válida. Revisa que sea la v3 (32 caracteres).", en: "Invalid key. Make sure it is the v3 key (32 characters)." },
  "wizard.confirmTitle": { es: "Todo se ve bien", en: "Everything looks good" },
  "wizard.tmdbConfigured": {
    es: "API key configurada",
    en: "API key configured",
  },
  "wizard.welcomeTitle": {
    es: "Bienvenido a BoxTeam",
    en: "Welcome to BoxTeam",
  },
  "wizard.welcomeDescription": {
    es: "Configura una biblioteca nueva o restaura una base de datos existente para no empezar desde cero.",
    en: "Set up a new library or restore an existing database so you do not have to start from scratch.",
  },
  "wizard.startFresh": {
    es: "Empezar configuración nueva",
    en: "Start fresh setup",
  },
  "wizard.restoreBackup": {
    es: "Restaurar copia de biblioteca",
    en: "Restore library backup",
  },
  "wizard.restoringBackup": {
    es: "Restaurando copia…",
    en: "Restoring backup…",
  },
  "wizard.restoreHelp": {
    es: "Selecciona un backup SQLite exportado desde otra instalación de BoxTeam.",
    en: "Choose a SQLite backup exported from another BoxTeam installation.",
  },
  "wizard.finishSetup": {
    es: "Guardar y abrir biblioteca",
    en: "Save & Open Library",
  },
  "wizard.preparingLibrary": {
    es: "Preparando biblioteca…",
    en: "Preparing library…",
  },
  "wizard.confirmDescription": {
    es: "Revisa la conexión, el idioma y la carpeta de descargas antes de terminar.",
    en: "Review the connection, language and download folder before finishing.",
  },
  "wizard.setupOverview": {
    es: "En unos pocos pasos tu biblioteca estará lista para indexar.",
    en: "A few steps and your library is ready to index.",
  },
  "wizard.startFreshDescription": {
    es: "Conecta tu FTP, valida TMDB y define las preferencias básicas desde el inicio.",
    en: "Connect your FTP, validate TMDB, and define the core preferences from the start.",
  },
  "wizard.setupOverviewDesc": {
    es: "Necesitas acceso a tu FTP y una API key gratuita de TMDB. Todo lo demás se puede ajustar después en Ajustes.",
    en: "You need access to your FTP and a free TMDB API key. Everything else can be tweaked later in Settings.",
  },
  "wizard.summaryTitle": {
    es: "Resumen de configuración",
    en: "Setup summary",
  },

  "settings.title": { es: "Ajustes", en: "Settings" },
  "settings.subtitle": {
    es: "Configura FTP, metadatos, descargas, servidores multimedia y el comportamiento de la librería con el mismo estilo visual del resto de la app.",
    en: "Configure FTP, metadata, downloads, media servers, and library behavior using the same panel style as the rest of the app.",
  },
  "settings.close": { es: "Cerrar ajustes", en: "Close settings" },
  "settings.ftpTitle": { es: "Servidor FTP", en: "FTP Server" },
  "ftp.tls": { es: "Usar FTPS (TLS explícito)", en: "Use FTPS (explicit TLS)" },
  "ftp.tlsHintOff": {
    es: "Desactivado: usuario, contraseña y archivos viajan sin cifrar. Actívalo si tu servidor admite AUTH TLS.",
    en: "Off: username, password and files travel unencrypted. Turn it on if your server supports AUTH TLS.",
  },
  "ftp.tlsHintOn": {
    es: "Usuario, contraseña, listados y transferencias van cifrados.",
    en: "Username, password, listings and transfers are encrypted.",
  },
  "ftp.tlsInsecure": {
    es: "Aceptar certificados autofirmados",
    en: "Accept self-signed certificates",
  },
  "ftp.tlsInsecureHint": {
    es: "Cifra la conexión pero no comprueba la identidad del servidor. Úsalo solo con servidores de confianza.",
    en: "Encrypts the connection but does not verify the server's identity. Only use it with servers you trust.",
  },
  "ftp.perm.title": { es: "Permisos del usuario FTP", en: "FTP user permissions" },
  "ftp.perm.subtitle": {
    es: "Comprobado con la configuración guardada, en la ruta raíz. Se crea y se borra una carpeta temporal.",
    en: "Checked with the saved settings, in the root path. A temporary folder is created and removed.",
  },
  "ftp.perm.recheck": { es: "Volver a comprobar", en: "Check again" },
  "ftp.perm.notConnected": { es: "No se pudo conectar", en: "Could not connect" },
  "ftp.perm.list": { es: "Listar carpetas", en: "List folders" },
  "ftp.perm.listHint": { es: "Necesario para indexar la librería.", en: "Needed to index the library." },
  "ftp.perm.download": { es: "Descargar archivos", en: "Download files" },
  "ftp.perm.downloadHint": { es: "Necesario para las descargas.", en: "Needed for downloads." },
  "ftp.perm.upload": { es: "Subir archivos", en: "Upload files" },
  "ftp.perm.uploadHint": {
    es: "Activa la pestaña Subidas.",
    en: "Enables the Uploads tab.",
  },
  "ftp.perm.mkdir": { es: "Crear carpetas", en: "Create folders" },
  "ftp.perm.mkdirHint": {
    es: "Para subir a una carpeta nueva (p. ej. una temporada).",
    en: "To upload into a new folder (e.g. a season).",
  },
  "ftp.perm.delete": { es: "Borrar archivos", en: "Delete files" },
  "ftp.perm.deleteHint": { es: "Para quitar subidas fallidas.", en: "To remove failed uploads." },
  "ftp.perm.uploadsOn": { es: "La pestaña Subidas está disponible", en: "The Uploads tab is available" },
  "ftp.perm.uploadsOff": { es: "La pestaña Subidas está oculta", en: "The Uploads tab is hidden" },
  "ftp.perm.unknown": {
    es: "(no se pudo comprobar)",
    en: "(could not be checked)",
  },
  "ftp.perm.checkedAt": { es: "comprobado a las", en: "checked at" },
  "settings.ftpDescription": {
    es: "Datos de conexión para navegar e indexar tu biblioteca remota.",
    en: "Connection details for browsing and indexing your remote media library.",
  },
  "settings.host": { es: "Host", en: "Host" },
  "settings.port": { es: "Puerto", en: "Port" },
  "settings.username": { es: "Usuario", en: "Username" },
  "settings.password": { es: "Contraseña", en: "Password" },
  "settings.rootPath": { es: "Ruta raíz", en: "Root Path" },
  "settings.testConnection": { es: "Probar conexión", en: "Test Connection" },
  "settings.browseRoot": { es: "Explorar raíz", en: "Browse Root" },
  "settings.listing": { es: "Listando…", en: "Listing…" },
  "settings.rootListing": {
    es: "Listado raíz ({count})",
    en: "Root listing ({count})",
  },
  "settings.dismiss": { es: "Cerrar", en: "Dismiss" },
  "settings.emptyDirectory": {
    es: "(directorio vacío)",
    en: "(empty directory)",
  },
  "settings.metaTitle": { es: "Metadatos e idioma", en: "Metadata & Language" },
  "settings.metaDescription": {
    es: "Acceso a TMDB y selección del idioma por defecto al abrir la app.",
    en: "TMDB access plus the default language used when the app opens.",
  },
  "settings.updatesTitle": { es: "Actualizaciones", en: "Updates" },
  "settings.updatesDescription": {
    es: "Controla cómo la app versiona sus builds y consulta nuevas versiones firmadas.",
    en: "Control how the app versions its builds and checks for new signed releases.",
  },
  "settings.currentVersion": { es: "Versión actual", en: "Current version" },
  "settings.versioningHelp": {
    es: "La versión de la app ahora sale de `package.json`, así el frontend y Tauri comparten el mismo número de versión.",
    en: "The app version now comes from `package.json`, so the frontend and Tauri share the same version number.",
  },
  "settings.updatesConfigured": { es: "Updater listo", en: "Updater ready" },
  "settings.autoCheckUpdates": {
    es: "Comprobar actualizaciones automáticamente",
    en: "Automatically check for updates",
  },
  "settings.autoCheckUpdatesHelp": {
    es: "Guarda tu preferencia para futuras comprobaciones automáticas de nuevas releases.",
    en: "Stores your preference for future automatic checks for new releases.",
  },
  "settings.updaterEndpoint": {
    es: "Endpoint de actualizaciones",
    en: "Update endpoint",
  },
  "settings.updaterEndpointPlaceholder": {
    es: "https://github.com/owner/repo/releases/latest/download/latest.json",
    en: "https://github.com/owner/repo/releases/latest/download/latest.json",
  },
  "settings.updaterEndpointHelp": {
    es: "Usa un `latest.json` estático o un endpoint dinámico del updater de Tauri.",
    en: "Use either a static `latest.json` or a dynamic Tauri updater endpoint.",
  },
  "settings.updaterPubkey": {
    es: "Clave pública del updater",
    en: "Updater public key",
  },
  "settings.updaterPubkeyPlaceholder": {
    es: "Pega aquí el contenido completo de tu clave pública PEM",
    en: "Paste the full PEM public key contents here",
  },
  "settings.updaterPubkeyHelp": {
    es: "Genera las claves con `npm run tauri signer generate` y pega aquí la clave pública.",
    en: "Generate keys with `npm run tauri signer generate` and paste the public key here.",
  },
  "settings.checkForUpdates": {
    es: "Buscar actualizaciones",
    en: "Check for updates",
  },
  "settings.checkingUpdates": {
    es: "Buscando actualizaciones…",
    en: "Checking for updates…",
  },
  "settings.updatesNotConfigured": {
    es: "Completa el endpoint y la clave pública para activar el updater seguro.",
    en: "Fill in the endpoint and public key to enable secure updater checks.",
  },
  "settings.updatesAvailable": {
    es: "Actualización disponible",
    en: "Update available",
  },
  "settings.updatesAvailableMessage": {
    es: "Hay una nueva versión disponible: v{version}.",
    en: "A new version is available: v{version}.",
  },
  "settings.updatesUpToDate": {
    es: "Ya estás en la última versión disponible.",
    en: "You're already on the latest available version.",
  },
  "settings.updatesUpToDateTitle": {
    es: "Todo al día",
    en: "Up to date",
  },
  "settings.updatesError": {
    es: "No se pudo comprobar la actualización",
    en: "Could not check for updates",
  },
  "settings.releaseDate": {
    es: "Fecha de publicación: {date}",
    en: "Release date: {date}",
  },
  "settings.tmdbKey": { es: "TMDB API Key (v3)", en: "TMDB API Key (v3)" },
  "settings.tmdbPlaceholder": {
    es: "Pega tu API key v3",
    en: "Paste your v3 API key",
  },
  "settings.tmdbTestOk": { es: "Funciona", en: "Works" },
  "settings.tmdbTestFail": { es: "Fallo", en: "Failed" },
  "settings.omdbKey": {
    es: "Clave OMDb (puntuación IMDb)",
    en: "OMDb API Key (IMDb rating)",
  },
  "settings.omdbPlaceholder": {
    es: "Pega tu API key de omdbapi.com",
    en: "Paste your omdbapi.com API key",
  },
  "settings.omdbHelp": {
    es: "OMDb expone la puntuación de IMDb. Saca una clave gratuita en omdbapi.com (1000 peticiones/día).",
    en: "OMDb exposes IMDb's rating. Get a free key at omdbapi.com (1000 requests/day).",
  },
  "settings.omdbTestOk": { es: "Funciona", en: "Works" },
  "settings.omdbTestFail": { es: "Fallo", en: "Failed" },
  "settings.tvdbKey": { es: "Clave TheTVDB", en: "TheTVDB API Key" },
  "settings.tvdbPlaceholder": {
    es: "Pega tu API key v4 de thetvdb.com",
    en: "Paste your thetvdb.com v4 API key",
  },
  "settings.tvdbHelp": {
    es: "TheTVDB devuelve un score propio. Saca tu clave gratuita en thetvdb.com/api-information.",
    en: "TheTVDB returns its own score. Get a free key at thetvdb.com/api-information.",
  },
  "settings.tvdbTestOk": { es: "Funciona", en: "Works" },
  "settings.tvdbTestFail": { es: "Fallo", en: "Failed" },
  "settings.test": { es: "Probar", en: "Test" },
  "settings.testing": { es: "Probando…", en: "Testing…" },
  "settings.ratingOrder": {
    es: "Orden de preferencia de puntuación",
    en: "Rating source preference",
  },
  "settings.ratingOrderHelp": {
    es: "La primera fuente con dato gana. Las demás aparecen como complemento en las fichas de detalle.",
    en: "First source with a value wins. The others appear as secondaries on detail pages.",
  },
  "settings.moveUp": { es: "Subir", en: "Move up" },
  "settings.moveDown": { es: "Bajar", en: "Move down" },
  "settings.refreshRatings": {
    es: "Actualizar puntuaciones del catálogo",
    en: "Refresh catalog ratings",
  },
  "settings.refreshRatingsRunning": {
    es: "Actualizando puntuaciones…",
    en: "Refreshing ratings…",
  },
  "settings.refreshRatingsDone": {
    es: "Listo — {count} títulos consultados",
    en: "Done — {count} titles checked",
  },
  "settings.refreshRatingsUpToDate": {
    es: "No falta ninguna puntuación",
    en: "No ratings are missing",
  },
  "settings.defaultLanguage": {
    es: "Idioma por defecto de la biblioteca",
    en: "Default Library Language",
  },
  "settings.defaultLanguageHelp": {
    es: "Define el idioma inicial al abrir la app. El usuario puede cambiarlo temporalmente desde la barra superior.",
    en: "This sets the startup language. Users can still switch temporarily from the top bar.",
  },
  "settings.downloadsTitle": { es: "Descargas", en: "Downloads" },
  "settings.downloadsDescription": {
    es: "Controla dónde se guardan los archivos y cuántas descargas simultáneas puede ejecutar la app.",
    en: "Control where files go and how aggressively the app downloads them.",
  },
  "settings.backupsTitle": {
    es: "Backups y restauración",
    en: "Backups & Restore",
  },
  "settings.backupsDescription": {
    es: "Exporta tu librería indexada o restaura una base de datos existente en una instalación nueva.",
    en: "Export your indexed library or restore an existing database into a fresh installation.",
  },
  "settings.exportBackup": { es: "Exportar backup", en: "Export backup" },
  "settings.importBackup": { es: "Importar backup", en: "Import backup" },
  "settings.backupsHelp": {
    es: "Los backups incluyen la librería indexada, metadatos TMDB, configuración y estado persistido de descargas.",
    en: "Backups include indexed library data, TMDB metadata, configuration, and persisted download state.",
  },
  "settings.backupExportSuccess": {
    es: "Backup exportado correctamente.",
    en: "Backup exported successfully.",
  },
  "settings.backupImportSuccess": {
    es: "Backup importado. Recargando la app…",
    en: "Backup imported. Reloading the app…",
  },
  "settings.storage": { es: "Almacenamiento", en: "Storage" },
  "settings.dbLocation": {
    es: "Ubicación de la biblioteca",
    en: "Library location",
  },
  "settings.dbLocationDesc": {
    es: "Directorio donde se guarda library.db. Cambiar la ubicación copiará la base de datos y reiniciará la app.",
    en: "Directory where library.db is stored. Changing it copies the database and restarts the app.",
  },
  "settings.changeLocation": {
    es: "Cambiar ubicación…",
    en: "Change location…",
  },
  "settings.defaultLocation": {
    es: "Restablecer predeterminada",
    en: "Reset to default",
  },
  "settings.portableMode": {
    es: "Modo portátil activo — la ubicación la fija el archivo .boxteam-portable.",
    en: "Portable mode active — location is set by the .boxteam-portable marker file.",
  },
  "settings.downloadFolder": {
    es: "Carpeta de descargas",
    en: "Download Folder",
  },
  "settings.downloadFolderPlaceholder": {
    es: "/Users/tuusuario/Peliculas",
    en: "/Users/you/Movies",
  },
  "settings.downloadFolderHelp": {
    es: "Ejemplo: `Movies/A/Avengers (2012)/file.mkv` y `TV Shows/Show/Season 01/file.mkv`.",
    en: "Example structure: `Movies/A/Avengers (2012)/file.mkv` and `TV Shows/Show/Season 01/file.mkv`.",
  },
  "settings.maxConcurrent": {
    es: "Máximo de descargas simultáneas",
    en: "Max Concurrent Downloads",
  },
  "settings.maxConcurrentHelp": {
    es: "Elige cuántos archivos pueden descargarse al mismo tiempo (1–5).",
    en: "Choose how many files can download at the same time (1–5).",
  },
  "settings.mediaServersTitle": {
    es: "Servidores multimedia",
    en: "Media Servers",
  },
  "settings.mediaServersDescription": {
    es: "Conexiones opcionales para comprobar presencia en librerías y futuros flujos de reproducción.",
    en: "Optional connections used for library presence checks and downstream playback workflows.",
  },
  "settings.embyDescription": {
    es: "Comprueba si los títulos visibles ya existen en Emby.",
    en: "Check whether visible titles already exist in Emby.",
  },
  "settings.plexDescription": {
    es: "Preparado para conectividad con Plex y futuras comprobaciones de presencia en la librería.",
    en: "Prepared for Plex connectivity and later library presence checks.",
  },
  "settings.serverUrl": { es: "URL del servidor", en: "Server URL" },
  "settings.apiKey": { es: "API Key", en: "API Key" },
  "settings.embyApiPlaceholder": { es: "API key de Emby", en: "Emby API key" },
  "settings.embyHelp": {
    es: "Dashboard → API Keys → crea una key. Incluye protocolo y puerto en la URL.",
    en: "Dashboard → API Keys → create a key. Include protocol and port in the URL.",
  },
  "settings.plexToken": { es: "Token de Plex", en: "Plex Token" },
  "settings.plexTokenPlaceholder": {
    es: "Tu X-Plex-Token",
    en: "Your X-Plex-Token",
  },
  "settings.plexHelp": {
    es: "Usa la URL del servidor y tu X-Plex-Token desde Plex Web o el flujo de claim.",
    en: "Use your server URL and X-Plex-Token from Plex Web or the claim flow.",
  },
  "settings.folderTypesTitle": { es: "Tipos de carpeta", en: "Folder Types" },
  "settings.folderTypesDescription": {
    es: "Asigna tus carpetas raíz del FTP a películas, series, documentales o contenido mixto para mejorar la categorización.",
    en: "Map your FTP root folders to movies, TV shows, documentaries, or mixed content for better categorization.",
  },
  "settings.folderTypesHelp": {
    es: "Estas asignaciones alimentan las pestañas de categorías, el emparejamiento con TMDB y las carpetas de destino.",
    en: "These mappings drive category tabs, metadata matching, and destination folders.",
  },
  "settings.loadRootFolders": {
    es: "Cargar carpetas raíz FTP",
    en: "Load FTP Root Folders",
  },
  "settings.loading": { es: "Cargando…", en: "Loading…" },
  "settings.folderRowHelp": {
    es: "Elige cómo debe aparecer el contenido de esta carpeta raíz en la librería.",
    en: "Choose how content inside this root folder should appear in the library.",
  },
  "settings.ignore": { es: "Ignorar", en: "Ignore" },
  "settings.movies": { es: "Películas", en: "Movies" },
  "settings.tvShows": { es: "Series", en: "TV Shows" },
  "settings.documentaries": { es: "Documentales", en: "Documentaries" },
  "settings.mixed": { es: "Mixto (auto-detectar)", en: "Mixed (auto-detect)" },
  "settings.noRootFolders": {
    es: "Todavía no se han cargado carpetas raíz del FTP.",
    en: "No FTP root folders loaded yet.",
  },
  "settings.footerHelp": {
    es: "Guarda los cambios ahora o guarda y lanza un nuevo escaneo de la librería inmediatamente.",
    en: "Save configuration changes now, or save and trigger a fresh library scan immediately.",
  },
  "settings.saveAndReindex": {
    es: "Guardar y reindexar",
    en: "Save & Re-index",
  },
  "settings.unsavedChanges": {
    es: "{count} cambios sin guardar",
    en: "{count} unsaved changes",
  },
  "settings.unsavedChangesOne": {
    es: "1 cambio sin guardar",
    en: "1 unsaved change",
  },
  "settings.discardChanges": { es: "Descartar", en: "Discard" },
  "settings.jumpTo": { es: "Ir a la sección", en: "Jump to section" },
  "telegramSetup.step1Title": { es: "Token del bot", en: "Bot token" },
  "telegramSetup.step1Hint": {
    es: "En Telegram, abre @BotFather, envía /newbot y pega aquí el token que te da.",
    en: "In Telegram, open @BotFather, send /newbot and paste the token it gives you here.",
  },
  "telegramSetup.tokenLabel": { es: "Token del bot de Telegram", en: "Telegram bot token" },
  "telegramSetup.step2Title": { es: "Bot en el grupo o canal", en: "Bot in the group or channel" },
  "telegramSetup.step2Hint": {
    es: "Añade el bot al grupo o canal donde quieres los anuncios, publica un mensaje (en un grupo, menciona al bot) y pulsa Detectar.",
    en: "Add the bot to the group or channel for the announcements, post a message (in a group, mention the bot) and press Detect.",
  },
  "telegramSetup.chatLabel": { es: "Chat ID del canal o grupo", en: "Channel or group chat ID" },
  "telegramSetup.detect": { es: "Detectar", en: "Detect" },
  "telegramSetup.detectTitle": {
    es: "Busca el último canal o grupo que ha escrito al bot",
    en: "Finds the last channel or group that wrote to the bot",
  },
  "telegramSetup.detecting": { es: "Buscando el chat…", en: "Looking for the chat…" },
  "telegramSetup.detected": {
    es: "Chat detectado. Guarda los cambios para usarlo.",
    en: "Chat detected. Save your changes to use it.",
  },
  "telegramSetup.detectedNamed": {
    es: "Detectado «{title}». Guarda los cambios para usarlo.",
    en: "Detected “{title}”. Save your changes to use it.",
  },
  "telegramSetup.step3Title": { es: "Permiso de administrador", en: "Admin rights" },
  "telegramSetup.step3Hint": {
    es: "Haz al bot administrador. En un canal, con el permiso «Publicar mensajes».",
    en: "Make the bot an admin. In a channel, with the “Post messages” right.",
  },
  "telegramSetup.step4Title": { es: "Prueba", en: "Test" },
  "telegramSetup.step4Hint": {
    es: "Envía un mensaje de prueba o un aviso de subida de ejemplo y míralo en Telegram.",
    en: "Send a test message or a sample upload notice and check it in Telegram.",
  },
  "telegramSetup.sendTest": { es: "Enviar prueba", en: "Send test" },
  "telegramSetup.sendSample": { es: "Enviar ejemplo de subida", en: "Send sample upload" },
  "telegramSetup.sendSampleTitle": {
    es: "Envía un aviso de subida de ejemplo con el formato real",
    en: "Sends a sample upload notice with the real format",
  },
  "telegramSetup.sending": { es: "Enviando…", en: "Sending…" },
  "telegramSetup.testSent": {
    es: "Mensaje de prueba enviado. Míralo en Telegram.",
    en: "Test message sent. Check it in Telegram.",
  },
  "telegramSetup.sampleSent": {
    es: "Ejemplo de aviso enviado. Así se verán las subidas.",
    en: "Sample notice sent. This is how uploads will look.",
  },
  "telegramSetup.checking": { es: "Comprobando…", en: "Checking…" },
  "telegramSetup.recheck": { es: "Volver a comprobar", en: "Check again" },
  "telegramSetup.footer": {
    es: "Cada subida terminada se anunciará con el póster, la calidad, el audio y los subtítulos. Deja el token vacío para no enviar avisos.",
    en: "Every finished upload is announced with its poster, quality, audio and subtitles. Leave the token empty to send nothing.",
  },
  "telegramSetup.allDone": {
    es: "Todo listo. Guarda los cambios y las subidas se anunciarán solas.",
    en: "All set. Save your changes and uploads will be announced automatically.",
  },
  "settingsNav.menuLabel": { es: "Secciones de ajustes", en: "Settings sections" },
  "settingsNav.searchPlaceholder": { es: "Buscar ajustes…", en: "Search settings…" },
  "settingsNav.clearSearch": { es: "Borrar búsqueda", en: "Clear search" },
  "settingsNav.resultsFor": { es: "Resultados para «{query}»", en: "Results for “{query}”" },
  "settingsNav.noResults": {
    es: "No hay ningún ajuste que coincida. Prueba con otra palabra, como «FTP», «Telegram» o «tema».",
    en: "No setting matches that. Try another word, like “FTP”, “Telegram” or “theme”.",
  },
  "settingsNav.general": { es: "General", en: "General" },
  "settingsNav.generalDesc": {
    es: "Apariencia, pestaña inicial y comportamiento de la ventana.",
    en: "Appearance, start tab and window behaviour.",
  },
  "settingsNav.library": { es: "Biblioteca", en: "Library" },
  "settingsNav.libraryDesc": {
    es: "Metadatos, carpetas, perfiles de calidad y mantenimiento de la biblioteca.",
    en: "Metadata, folders, quality profiles and library maintenance.",
  },
  "settingsNav.connection": { es: "Conexión", en: "Connection" },
  "settingsNav.connectionDesc": {
    es: "Servidor FTP, descargas, servidores multimedia e interfaz web.",
    en: "FTP server, downloads, media servers and web interface.",
  },
  "settingsNav.notifications": { es: "Avisos", en: "Notifications" },
  "settingsNav.notificationsDesc": {
    es: "Avisos por Telegram: el canal de anuncios de subidas y tus avisos personales.",
    en: "Telegram notifications: the upload announcement channel and your personal alerts.",
  },
  "settingsNav.system": { es: "Sistema", en: "System" },
  "settingsNav.systemDesc": {
    es: "Almacenamiento, copias de seguridad y zona de peligro.",
    en: "Storage, backups and danger zone.",
  },

  // ── Folder Routing ─────────────────────────────────────────────────────
  "settings.folderRoutingTitle": {
    es: "Enrutamiento de carpetas",
    en: "Folder Routing",
  },
  "settings.folderRoutingDescription": {
    es: "Configura carpetas destino por tipo de contenido, activa subcarpetas A-Z y añade reglas de enrutamiento por género.",
    en: "Set destination folders for each media type, toggle A-Z subfolders, and add genre-based routing rules.",
  },
  "settings.alphabeticalSubfolders": {
    es: "Subcarpetas alfabéticas",
    en: "Alphabetical subfolders",
  },
  "settings.alphabeticalSubfoldersHelp": {
    es: "Agrupa películas y documentales en subcarpetas A-Z (p.ej. Movies/A/Avatar (2009)/…)",
    en: "Group movies and documentaries into A-Z subfolders (e.g. Movies/A/Avatar (2009)/…)",
  },
  "settings.genreRules": { es: "Reglas por género", en: "Genre Rules" },
  "settings.genreRulesHelp": {
    es: "Reemplaza el destino de ítems que coincidan con géneros específicos. Las reglas se evalúan en orden — gana la primera que coincida.",
    en: "Override the destination for items matching specific genres. Rules are checked in order — first match wins.",
  },
  "settings.addRule": { es: "Añadir regla", en: "Add Rule" },
  "settings.noGenreRules": {
    es: "Sin reglas de género aún. Añade una para enrutar géneros específicos (p.ej. Animación) a una carpeta personalizada.",
    en: "No genre rules yet. Add one to route specific genres (e.g. Animation) to a custom folder.",
  },
  "settings.ruleName": { es: "Nombre de regla", en: "Rule Name" },
  "settings.applyTo": { es: "Aplicar a", en: "Apply to" },
  "settings.allTypes": { es: "Todos los tipos", en: "All types" },
  "settings.genres": { es: "Géneros", en: "Genres" },
  "settings.destination": { es: "Destino", en: "Destination" },
  "common.remove": { es: "Eliminar", en: "Remove" },

  // ── Web Interface (LAN) ────────────────────────────────────────────────
  "settings.webInterfaceTitle": {
    es: "Interfaz web (LAN)",
    en: "Web Interface (LAN)",
  },
  "settings.webInterfaceDescription": {
    es: "Expone una interfaz web accesible desde el navegador en tu red local. Reinicia la app tras guardar cambios.",
    en: "Expose a browser-accessible web interface on your local network. Restart the app after changing settings.",
  },
  "settings.webInterfaceEnable": {
    es: "Activar interfaz web",
    en: "Enable web interface",
  },
  "settings.webInterfaceBindHost": { es: "Host de escucha", en: "Bind host" },
  "settings.webInterfaceExposedPort": {
    es: "Puerto expuesto",
    en: "Exposed port",
  },
  "settings.webInterfaceSameAsPort": {
    es: "Mismo que puerto",
    en: "Same as port",
  },
  "settings.webInterfaceAppUrl": {
    es: "URL de la app (opcional, para links en emails)",
    en: "App URL (optional, for email links)",
  },
  "settings.webInterfaceOtp": {
    es: "Requerir OTP por email al iniciar sesión",
    en: "Require email OTP on login",
  },
  "settings.webInterfaceSmtpSettings": {
    es: "Configuración SMTP",
    en: "SMTP settings",
  },
  "settings.webInterfaceSmtpHost": { es: "Host SMTP", en: "SMTP host" },
  "settings.webInterfaceFromAddress": {
    es: "Dirección remitente",
    en: "From address",
  },
  "settings.webInterfaceSave": {
    es: "Guardar ajustes de interfaz web",
    en: "Save Web Interface Settings",
  },
  "settings.webInterfaceInitNow": {
    es: "Guardar + Iniciar ahora",
    en: "Save + Initialize Now",
  },
  "settings.webInterfaceStarting": { es: "Iniciando…", en: "Starting…" },
  "settings.webInterfaceSaved": {
    es: "Ajustes de interfaz web guardados.",
    en: "Web interface settings saved.",
  },
  "settings.webInterfaceSavedWeb": {
    es: "Ajustes guardados. Ya están activos en esta sesión web.",
    en: "Web interface settings saved. They are already active in this web session.",
  },
  "settings.webInterfaceInitialized": {
    es: "Interfaz web iniciada. Abre http://localhost:47860 (o el host/puerto configurado).",
    en: "Web interface initialized. Open http://localhost:47860 (or your configured host/port).",
  },
  "settings.webInterfaceErrorSave": {
    es: "No se pudo guardar la configuración de la interfaz web",
    en: "Failed to save WebGUI settings",
  },
  "settings.webInterfaceErrorInit": {
    es: "No se pudo inicializar la interfaz web",
    en: "Failed to initialize WebGUI",
  },

  "settings.pwaTitle": {
    es: "App instalable (PWA)",
    en: "Installable App (PWA)",
  },
  "settings.pwaDescription": {
    es: "Permite instalar BoxTeam como aplicación nativa en dispositivos móviles y escritorio desde el navegador.",
    en: "Allow BoxTeam to be installed as a native app on mobile and desktop from the browser.",
  },
  "settings.pwaName": { es: "Nombre completo de la app", en: "Full app name" },
  "settings.pwaShortName": { es: "Nombre corto", en: "Short name" },
  "settings.pwaShortNameHelp": {
    es: "Máximo 12 caracteres. Se muestra bajo el icono en la pantalla de inicio.",
    en: "Max 12 characters. Shown under the icon on the home screen.",
  },

  "toast.tmdb": { es: "Enriqueciendo", en: "Enriching" },
  "toast.tmdbTitle": {
    es: "Enriqueciendo metadatos",
    en: "Enriching metadata",
  },
  "toast.tmdbOf": {
    es: "{done} de {total} títulos",
    en: "{done} of {total} titles",
  },

  "settings.appearanceTitle": { es: "Apariencia", en: "Appearance" },
  "settings.appearanceDescription": {
    es: "Elige cómo se ve BoxTeam. Sistema sigue la preferencia de tu SO y se actualiza al instante.",
    en: "Choose how BoxTeam looks. System follows your OS preference and updates live.",
  },
  "settings.themeSystem": { es: "Sistema", en: "System" },
  "settings.themeDark": { es: "Oscuro", en: "Dark" },
  "settings.themeLight": { es: "Claro", en: "Light" },
  "settings.themeSystemDesc": {
    es: "Sigue automáticamente el modo oscuro/claro de tu sistema operativo.",
    en: "Automatically matches your operating system's dark/light setting.",
  },
  "settings.themeDarkDesc": {
    es: "Siempre usa modo oscuro independientemente del ajuste del SO.",
    en: "Always use dark mode regardless of OS setting.",
  },
  "settings.themeLightDesc": {
    es: "Siempre usa modo claro independientemente del ajuste del SO.",
    en: "Always use light mode regardless of OS setting.",
  },
  "settings.preferencesTitle": { es: "Preferencias", en: "Preferences" },
  "settings.preferencesDescription": {
    es: "Elige la pestaña inicial, el orden por defecto de cada pestaña y la vista predeterminada de Películas y Series.",
    en: "Pick the landing tab, the default sort for each tab, and the default Movies and TV views.",
  },
  "settings.defaultTab": { es: "Pestaña inicial", en: "Default tab" },
  "settings.defaultSort": { es: "Orden por defecto", en: "Default sort" },
  "settings.defaultMovieView": {
    es: "Vista de Películas",
    en: "Movies view",
  },
  "settings.defaultTvView": { es: "Vista de Series", en: "TV view" },
  "settings.movieViewGrouped": { es: "Agrupada", en: "Grouped" },
  "settings.movieViewFiles": { es: "Archivos", en: "Files" },
  "settings.tvViewShows": { es: "Series", en: "Shows" },
  "settings.tvViewEpisodes": { es: "Episodios", en: "Episodes" },
  "settings.resetDefaults": {
    es: "Restablecer valores",
    en: "Reset to defaults",
  },
  "nav.alphaJump": { es: "Saltar a letra", en: "Jump to letter" },

  "settings.desktopTitle": { es: "Escritorio", en: "Desktop" },
  "settings.desktopDescription": {
    es: "Comportamiento de la ventana de la aplicación de escritorio.",
    en: "Behaviour of the desktop application window.",
  },
  "settings.closeToTrayLabel": {
    es: "Minimizar a bandeja",
    en: "Close to tray",
  },
  "settings.closeToTrayHelp": {
    es: "Al cerrar la ventana, BoxTeam se oculta en la bandeja del sistema en lugar de cerrarse.",
    en: "Closing the window hides BoxTeam to the system tray instead of quitting.",
  },

  "quit.title": { es: "Descargas en curso", en: "Downloads in progress" },
  "quit.body": {
    es: "{count} descarga(s) se cancelarán si cierras. ¿Continuar?",
    en: "{count} download(s) will be cancelled if you quit. Continue?",
  },
  "quit.keep": { es: "Seguir descargando", en: "Keep Downloading" },
  "quit.confirm": { es: "Cerrar de todas formas", en: "Quit Anyway" },

  "metaRefresh.banner": {
    es: "Actualizando metadatos · {done}/{total}",
    en: "Updating metadata · {done}/{total}",
  },
  "watchProviders.banner": {
    es: "Actualizando plataformas · {done}/{total}",
    en: "Refreshing platforms · {done}/{total}",
  },
  "ratings.banner": {
    es: "Actualizando puntuaciones · {done}/{total}",
    en: "Refreshing ratings · {done}/{total}",
  },

  // Watchlist
  "watchlist.addToWatchlist": {
    es: "Agregar a seguimiento",
    en: "Add to watchlist",
  },
  "watchlist.inWatchlist": { es: "En seguimiento", en: "In watchlist" },
  "watchlist.addTitle": { es: "Agregar a Seguimiento", en: "Add to Watchlist" },
  "watchlist.back": { es: "Volver", en: "Back" },
  "watchlist.coverage": { es: "Cobertura", en: "Coverage" },
  "watchlist.allSeasons": { es: "Todas las temporadas", en: "All seasons" },
  "watchlist.latestSeason": { es: "Última temporada", en: "Latest season" },
  "watchlist.autoDownload": {
    es: "Auto-descarga al indexar",
    en: "Auto-download on indexing",
  },
  "watchlist.qualityProfile": {
    es: "Perfil de calidad",
    en: "Quality profile",
  },
  "watchlist.newProfile": {
    es: "Nuevo perfil",
    en: "New profile",
  },
  "watchlist.useExistingProfile": {
    es: "Usar uno existente",
    en: "Use an existing one",
  },
  "watchlist.createFirstProfile": {
    es: "Crea tu primer perfil de calidad",
    en: "Create your first quality profile",
  },
  "watchlist.createFirstProfileHint": {
    es: "Define qué calidad prefieres para tus descargas. Podrás añadir más perfiles desde Ajustes.",
    en: "Define which quality you prefer for downloads. You can add more profiles later from Settings.",
  },
  "watchlist.newProfileHint": {
    es: "Configura un perfil específico para este título. Quedará disponible para futuros.",
    en: "Configure a profile tailored to this title. It'll be reusable for future ones.",
  },
  "watchlist.createProfileAndAdd": {
    es: "Crear perfil y añadir",
    en: "Create profile and add",
  },
  "watchlist.newProfileNameRequired": {
    es: "Ponle un nombre al perfil.",
    en: "Give the profile a name.",
  },
  "watchlist.cancel": { es: "Cancelar", en: "Cancel" },
  "watchlist.adding": { es: "Añadiendo…", en: "Adding…" },
  "watchlist.add": { es: "Agregar", en: "Add" },
  "watchlist.detail": { es: "Detalle", en: "Detail" },
  "watchlist.available": { es: "Disponible", en: "Available" },
  "watchlist.pending": { es: "Pendiente", en: "Pending" },
  "watchlist.filesInLibrary": {
    es: "archivo(s) en librería",
    en: "file(s) in library",
  },
  "watchlist.saving": { es: "Guardando…", en: "Saving…" },
  "watchlist.saveChanges": { es: "Guardar cambios", en: "Save changes" },
  "watchlist.noResults": { es: "Sin resultados.", en: "No results." },
  "watchlist.searchPlaceholder": { es: "Buscar título…", en: "Search title…" },
  "watchlist.searching": { es: "Buscando…", en: "Searching…" },
  "watchlist.search": { es: "Buscar", en: "Search" },
  "watchlist.movie": { es: "Película", en: "Movie" },
  "watchlist.episodesInLibrary": {
    es: "Episodios en librería",
    en: "Episodes in library",
  },
  "watchlist.loadingCoverage": { es: "Cargando…", en: "Loading…" },
  "watchlist.noEpisodesInLibrary": {
    es: "Ningún episodio en librería.",
    en: "No episodes in library.",
  },
  "watchlist.season": { es: "Temporada", en: "Season" },
  "watchlist.removeFromWatchlist": {
    es: "Quitar del seguimiento",
    en: "Remove from watchlist",
  },
  "watchlist.alreadyAdded": { es: "Ya añadido", en: "Already added" },
  "watchlist.files": { es: "archivos", en: "files" },
  "watchlist.typeTv": { es: "Serie", en: "TV show" },
  "watchlist.clearFilters": { es: "Limpiar filtros", en: "Clear filters" },
  "watchlist.clearSearch": { es: "Borrar búsqueda", en: "Clear search" },
  "watchlist.confirmRemove": { es: "¿Quitar?", en: "Remove?" },
  "watchlist.confirmRemoveLong": {
    es: "Sí, quitar",
    en: "Yes, remove",
  },
  "watchlist.saveError": {
    es: "No se han podido guardar los cambios. Inténtalo de nuevo.",
    en: "Couldn't save the changes. Please try again.",
  },
  "watchlist.removeError": {
    es: "No se ha podido quitar del seguimiento.",
    en: "Couldn't remove it from the watchlist.",
  },
  "watchlist.onServerCount": {
    es: "{count}/{total} en el servidor",
    en: "{count}/{total} on the server",
  },

  // Quality Profiles (Settings section)
  "qualityProfile.title": { es: "Perfiles de calidad", en: "Quality Profiles" },
  "qualityProfile.description": {
    es: "Define perfiles personalizados para resolución, codecs, tipo de fuente y tamaño de archivo usados al auto-descargar.",
    en: "Define custom profiles for resolution, codecs, release type, and file size used during auto-downloads.",
  },
  "qualityProfile.newProfile": { es: "Nuevo perfil", en: "New profile" },
  "qualityProfile.name": { es: "Nombre", en: "Name" },
  "qualityProfile.namePlaceholder": {
    es: "Mi perfil personalizado",
    en: "My Custom Profile",
  },
  "qualityProfile.minResolution": {
    es: "Resolución mínima",
    en: "Min resolution",
  },
  "qualityProfile.preferredResolution": {
    es: "Resolución preferida",
    en: "Preferred resolution",
  },
  "qualityProfile.anyResolution": { es: "Cualquiera", en: "Any" },
  "qualityProfile.preferredCodecs": {
    es: "Codecs preferidos (ordenados)",
    en: "Preferred codecs (ordered)",
  },
  "qualityProfile.preferredAudio": {
    es: "Codecs de audio preferidos (ordenados)",
    en: "Preferred audio codecs (ordered)",
  },
  "qualityProfile.preferredRelease": {
    es: "Tipos de fuente preferidos (ordenados)",
    en: "Preferred release types (ordered)",
  },
  "qualityProfile.preferHdr": { es: "Preferir HDR", en: "Prefer HDR" },
  "qualityProfile.maxSizeGb": { es: "Tamaño máximo (GB)", en: "Max size (GB)" },
  "qualityProfile.minSizeGb": { es: "Tamaño mínimo (GB)", en: "Min size (GB)" },
  "qualityProfile.cancel": { es: "Cancelar", en: "Cancel" },
  "qualityProfile.save": { es: "Guardar", en: "Save" },
  "qualityProfile.edit": { es: "Editar", en: "Edit" },
  "qualityProfile.delete": { es: "Eliminar", en: "Delete" },
  "qualityProfile.confirmDelete": { es: "¿Confirmar?", en: "Confirm?" },

  // Upload section
  "upload.title": { es: "Subidas", en: "Uploads" },
  "upload.uploadFiles": { es: "Subir archivos", en: "Upload files" },
  "upload.selectFiles": { es: "Seleccionar archivos", en: "Select files" },
  "upload.selectFolder": { es: "Seleccionar carpeta", en: "Select folder" },
  "upload.analysing": { es: "Analizando…", en: "Analysing…" },
  "upload.ffprobeMissing": {
    es: "ffprobe no encontrado. Instala ffmpeg para obtener información detallada del archivo.",
    en: "ffprobe not found. Install ffmpeg to get detailed file information.",
  },
  "upload.destination": { es: "Destino en el FTP", en: "FTP destination" },
  "upload.rename": { es: "Renombrar archivo", en: "Rename file" },
  "upload.addToQueue": { es: "Añadir a la cola", en: "Add to queue" },
  "upload.writeError": {
    es: "Sin permiso de escritura en el FTP. Comprueba la configuración del servidor.",
    en: "No write permission on FTP. Check your server configuration.",
  },
  "upload.noUploads": { es: "No hay subidas", en: "No uploads" },
  "upload.noUploadsDesc": {
    es: "Pulsa «Subir archivos» para empezar.",
    en: "Click «Upload files» to start.",
  },
  "upload.active": { es: "En curso", en: "Active" },
  "upload.history": { es: "Historial", en: "History" },
  "upload.clearCompleted": { es: "Limpiar historial", en: "Clear history" },
  "upload.status.queued": { es: "En cola", en: "Queued" },
  "upload.status.uploading": { es: "Subiendo", en: "Uploading" },
  "upload.status.done": { es: "Completada", en: "Done" },
  "upload.status.error": { es: "Error", en: "Error" },
  "upload.status.cancelled": { es: "Cancelada", en: "Cancelled" },
  "upload.filenamePreview": {
    es: "Vista previa del nombre",
    en: "Filename preview",
  },
  "upload.stepSelect": { es: "Seleccionar", en: "Select" },
  "upload.stepAnalyse": { es: "Analizar", en: "Analyse" },
  "upload.stepConfigure": { es: "Configurar", en: "Configure" },
  "upload.next": { es: "Siguiente", en: "Next" },
  "upload.back": { es: "Atrás", en: "Back" },
  "upload.noFilesSelected": {
    es: "No has seleccionado ningún archivo.",
    en: "No files selected.",
  },
  "upload.retry": { es: "Reintentar", en: "Retry" },
  "upload.cancel": { es: "Cancelar", en: "Cancel" },
  "upload.delete": { es: "Eliminar", en: "Delete" },

  // Telegram (Settings)
  "telegram.section": { es: "Notificaciones", en: "Notifications" },
  "telegram.sectionDesc": {
    es: "Recibe un mensaje de Telegram cuando termine una subida.",
    en: "Get a Telegram message when an upload finishes.",
  },
  "telegram.token": { es: "Token del bot", en: "Bot token" },
  "telegram.tokenPlaceholder": { es: "123456:ABCdef…", en: "123456:ABCdef…" },
  "telegram.chatId": { es: "Chat ID / canal", en: "Chat ID / channel" },
  "telegram.chatIdPlaceholder": {
    es: "@micanal o -100123456789",
    en: "@mychannel or -100123456789",
  },
  "telegram.test": { es: "Probar", en: "Test" },
  "telegram.testing": { es: "Probando…", en: "Testing…" },
  "telegram.ok": { es: "Mensaje enviado", en: "Message sent" },
  "telegram.error": { es: "Error al enviar", en: "Send failed" },

  // Telegram bot setup guide (Uploads tab + Settings → Notificaciones)
  "telegramGuide.button": { es: "Avisos de Telegram", en: "Telegram notices" },
  "telegramGuide.title": {
    es: "Cómo configurar el bot de Telegram",
    en: "How to set up the Telegram bot",
  },
  "telegramGuide.intro": {
    es: "Cuando termina una subida, BoxTeam la anuncia en un canal o grupo de Telegram con el póster, la calidad, el audio y los subtítulos. Para eso necesitas un bot tuyo. Se configura una sola vez y tardas unos 5 minutos.",
    en: "When an upload finishes, BoxTeam announces it in a Telegram channel or group with the poster, quality, audio and subtitles. You need your own bot for that. It's a one-time setup that takes about 5 minutes.",
  },
  "telegramGuide.toggleShow": {
    es: "¿Cómo configuro el bot? Ver la guía paso a paso",
    en: "How do I set up the bot? See the step-by-step guide",
  },
  "telegramGuide.toggleHide": { es: "Ocultar la guía", en: "Hide the guide" },
  "telegramGuide.step1Title": { es: "Crea el bot", en: "Create the bot" },
  "telegramGuide.step1Body": {
    es: "Abre Telegram, busca @BotFather (la cuenta oficial, con la marca azul) y envíale /newbot. Ponle un nombre y un usuario que termine en «bot», por ejemplo MisSubidasBot.",
    en: "Open Telegram, search for @BotFather (the official account, with the blue check) and send it /newbot. Give it a name and a username ending in “bot”, for example MyUploadsBot.",
  },
  "telegramGuide.step2Title": { es: "Copia el token", en: "Copy the token" },
  "telegramGuide.step2Body": {
    es: "BotFather te responde con un token parecido a «1234567890:ABCdef…». Cópialo entero y no lo compartas: quien lo tenga puede escribir en nombre de tu bot.",
    en: "BotFather replies with a token like “1234567890:ABCdef…”. Copy all of it and keep it private: anyone who has it can post as your bot.",
  },
  "telegramGuide.step3Title": {
    es: "Añade el bot al canal o grupo",
    en: "Add the bot to the channel or group",
  },
  "telegramGuide.step3Body": {
    es: "En un canal: Administradores → Añadir administrador → busca tu bot y deja activado «Publicar mensajes». En un grupo basta con añadirlo como miembro.",
    en: "In a channel: Administrators → Add administrator → find your bot and keep “Post messages” enabled. In a group, adding it as a member is enough.",
  },
  "telegramGuide.step4Title": {
    es: "Pega el token en BoxTeam",
    en: "Paste the token into BoxTeam",
  },
  "telegramGuide.step4Body": {
    es: "Ve a Ajustes → Notificaciones → Canal de anuncios y pégalo en «Token del bot de Telegram».",
    en: "Go to Settings → Notifications → Announcement channel and paste it into “Telegram bot token”.",
  },
  "telegramGuide.step5Title": { es: "Detecta el chat", en: "Detect the chat" },
  "telegramGuide.step5Body": {
    es: "Publica cualquier mensaje en el canal o grupo y pulsa «Detectar»: BoxTeam rellena el Chat ID solo. En canales y supergrupos empieza por -100. Si no lo encuentra, publica otro mensaje y vuelve a pulsar.",
    en: "Post any message in the channel or group and press “Detect”: BoxTeam fills in the Chat ID for you. For channels and supergroups it starts with -100. If it isn't found, post another message and press it again.",
  },
  "telegramGuide.step6Title": { es: "Prueba y guarda", en: "Test and save" },
  "telegramGuide.step6Body": {
    es: "Pulsa «Enviar ejemplo de subida» para ver cómo quedará el aviso y después guarda los cambios. A partir de ahí, cada subida terminada se anuncia sola.",
    en: "Press “Send upload sample” to see what the notice looks like, then save your changes. From then on, every finished upload is announced automatically.",
  },
  "telegramGuide.tipsTitle": { es: "Bueno saberlo", en: "Good to know" },
  "telegramGuide.tipBatch": {
    es: "Si subes una temporada entera, los episodios se anuncian juntos en un único mensaje cuando termina el último.",
    en: "If you upload a whole season, the episodes are announced together in a single message when the last one finishes.",
  },
  "telegramGuide.tipDisable": {
    es: "Para dejar de enviar avisos, borra el token y guarda.",
    en: "To stop sending notices, clear the token and save.",
  },
  "telegramGuide.tipWebhook": {
    es: "Si «Detectar» dice que el bot tiene un webhook activo, ese bot ya lo usa otro servicio: crea uno nuevo o escribe el Chat ID a mano.",
    en: "If “Detect” says the bot has an active webhook, another service is already using that bot: create a new one or type the Chat ID by hand.",
  },
  "telegramGuide.tipPersonal": {
    es: "¿Quieres avisos solo para ti? En la pestaña «Mis avisos» puedes vincular un bot personal: créalo igual con @BotFather, envíale un mensaje y pega su token.",
    en: "Want notices just for you? In the “My notices” tab you can link a personal bot: create it the same way with @BotFather, send it a message and paste its token.",
  },
  "telegramGuide.openSettings": {
    es: "Abrir Ajustes de Telegram",
    en: "Open Telegram settings",
  },

  "reset.sectionTitle": { es: "Zona de peligro", en: "Danger zone" },
  "reset.sectionDescription": {
    es: "Acciones que borran datos de BoxTeam. Los archivos del FTP nunca se tocan.",
    en: "Actions that delete BoxTeam data. Files on the FTP are never touched.",
  },
  "reset.libraryTitle": { es: "Reiniciar biblioteca", en: "Reset library" },
  "reset.libraryDescription": {
    es: "Borra el índice y los emparejamientos con TMDB y vuelve a indexar el FTP desde cero. Útil tras mejorar la detección de series y películas.",
    en: "Deletes the index and TMDB matches and re-indexes the FTP from scratch. Useful after detection improvements.",
  },
  "reset.libraryButton": { es: "Reiniciar biblioteca", en: "Reset library" },
  "reset.libraryConfirmTitle": {
    es: "¿Reiniciar la biblioteca?",
    en: "Reset the library?",
  },
  "reset.libraryConfirmDescription": {
    es: "Se volverá a indexar todo el FTP. Según el tamaño de tu biblioteca puede tardar un rato.",
    en: "The whole FTP will be indexed again. Depending on your library size this can take a while.",
  },
  "reset.factoryTitle": { es: "Restablecer de fábrica", en: "Factory reset" },
  "reset.factoryDescription": {
    es: "Borra la biblioteca y toda la configuración y vuelve al asistente inicial.",
    en: "Deletes the library and every setting and goes back to the setup wizard.",
  },
  "reset.factoryButton": { es: "Restablecer de fábrica", en: "Factory reset" },
  "reset.factoryConfirmTitle": {
    es: "¿Restablecer BoxTeam de fábrica?",
    en: "Factory reset BoxTeam?",
  },
  "reset.factoryConfirmDescription": {
    es: "No se puede deshacer. Si quieres conservar algo, exporta antes una copia de seguridad.",
    en: "This can't be undone. Export a backup first if you want to keep anything.",
  },
  "reset.factoryPhrase": { es: "BORRAR", en: "DELETE" },
  "reset.factoryPhrasePrompt": {
    es: "Escribe {phrase} para confirmar",
    en: "Type {phrase} to confirm",
  },
  "reset.removesIndex": {
    es: "Todos los elementos indexados",
    en: "Every indexed item",
  },
  "reset.removesMatches": {
    es: "Los emparejamientos con TMDB, también los corregidos a mano",
    en: "TMDB matches, including manual fixes",
  },
  "reset.removesSettings": {
    es: "La configuración: FTP, claves de API, carpetas y servidores",
    en: "Settings: FTP, API keys, folders and servers",
  },
  "reset.removesWatchlist": {
    es: "La lista de seguimiento, los perfiles de calidad y los avisos de Telegram",
    en: "Watchlist, quality profiles and Telegram alerts",
  },
  "reset.keepsSettings": { es: "Tu configuración", en: "Your settings" },
  "reset.keepsWatchlist": {
    es: "La lista de seguimiento y los perfiles de calidad",
    en: "Watchlist and quality profiles",
  },
  "reset.keepsFtpFiles": {
    es: "Los archivos del FTP y tus descargas",
    en: "Files on the FTP and your downloads",
  },
  "reset.keepsWebUsers": {
    es: "Los usuarios web, para que no pierdas el acceso",
    en: "Web users, so you don't lose access",
  },
  "reset.keepsWebAccess": {
    es: "La configuración de la interfaz web",
    en: "Web interface settings",
  },
  "reset.working": { es: "Borrando…", en: "Deleting…" },

  "reset.metadataTitle": {
    es: "Borrar metadatos y volver a buscarlos",
    en: "Clear metadata and fetch it again",
  },
  "reset.metadataDescription": {
    es: "Quita carátulas, sinopsis y notas de toda la biblioteca y vuelve a emparejar cada título con TMDB. Útil si muchos datos se han quedado mal.",
    en: "Removes posters, overviews and ratings from the whole library and matches every title with TMDB again. Useful when a lot of data went wrong.",
  },
  "reset.metadataButton": { es: "Borrar metadatos", en: "Clear metadata" },
  "reset.metadataConfirmTitle": {
    es: "¿Borrar los metadatos de toda la biblioteca?",
    en: "Clear metadata for the whole library?",
  },
  "reset.metadataConfirmDescription": {
    es: "Después se vuelven a buscar todos en TMDB. Mientras tanto verás títulos sin carátula. Tarda unos 4 minutos por cada 1.000 títulos.",
    en: "Everything is fetched from TMDB again afterwards. Meanwhile titles will show without posters. It takes about 4 minutes per 1,000 titles.",
  },
  "reset.removesMetadata": {
    es: "Carátulas, sinopsis, notas, géneros y plataformas",
    en: "Posters, overviews, ratings, genres and platforms",
  },
  "reset.keepsManualMatches": {
    es: "Las coincidencias que corregiste a mano",
    en: "Matches you fixed by hand",
  },
  "reset.keepsIndex": {
    es: "El índice de archivos (no se vuelve a escanear el FTP)",
    en: "The file index (the FTP is not scanned again)",
  },
  "reset.metadataStarted": {
    es: "Metadatos borrados. Se están volviendo a buscar en segundo plano.",
    en: "Metadata cleared. It's being fetched again in the background.",
  },

  "updates.title": { es: "Actualizaciones", en: "Updates" },
  "updates.description": {
    es: "Instala las versiones nuevas sin volver a descargar el instalador.",
    en: "Install new versions without downloading the installer again.",
  },
  "updates.currentVersion": { es: "Tienes la versión {version}", en: "You have version {version}" },
  "updates.check": { es: "Buscar actualizaciones", en: "Check for updates" },
  "updates.checking": { es: "Buscando…", en: "Checking…" },
  "updates.upToDate": { es: "Ya tienes la última versión.", en: "You're on the latest version." },
  "updates.available": {
    es: "Hay una versión nueva: {version}.",
    en: "A new version is available: {version}.",
  },
  "updates.install": { es: "Instalar y reiniciar", en: "Install and restart" },
  "updates.retry": { es: "Reintentar", en: "Try again" },
  "updates.later": { es: "Más tarde", en: "Later" },
  "updates.downloading": { es: "Descargando la actualización…", en: "Downloading the update…" },
  "updates.downloadingPercent": {
    es: "Descargando la actualización… {percent} %",
    en: "Downloading the update… {percent}%",
  },
  "updates.restarting": { es: "Instalada. Reiniciando BoxTeam…", en: "Installed. Restarting BoxTeam…" },
  "updates.installFailed": {
    es: "No se pudo instalar la actualización. Tu versión actual sigue funcionando.",
    en: "The update couldn't be installed. Your current version keeps working.",
  },
  "updates.checkFailed": {
    es: "No se pudo comprobar si hay versiones nuevas. Revisa tu conexión.",
    en: "Couldn't check for new versions. Check your connection.",
  },
  "updates.unsupported": {
    es: "Esta instalación (portable, .deb/.rpm o Docker) se actualiza descargando la versión nueva.",
    en: "This install (portable, .deb/.rpm or Docker) is updated by downloading the new version.",
  },
  "updates.help": {
    es: "BoxTeam busca versiones nuevas al arrancar y cada 6 horas. Las actualizaciones van firmadas y se comprueban antes de instalarse.",
    en: "BoxTeam checks for new versions at startup and every 6 hours. Updates are signed and verified before they're installed.",
  },
  "updates.toastTitle": { es: "BoxTeam {version} disponible", en: "BoxTeam {version} is available" },
  "updates.toastBody": {
    es: "Se descarga, se instala y la app se reinicia sola.",
    en: "It downloads, installs and the app restarts on its own.",
  },
  "maintenance.title": {
    es: "Mantenimiento de la biblioteca",
    en: "Library maintenance",
  },
  "maintenance.description": {
    es: "BoxTeam hace esto solo al arrancar y cada 15 minutos. Úsalo si no quieres esperar.",
    en: "BoxTeam does this on its own at startup and every 15 minutes. Use it if you don't want to wait.",
  },
  "maintenance.metadataTitle": {
    es: "Completar metadatos que faltan",
    en: "Fill in missing metadata",
  },
  "maintenance.metadataDescription": {
    es: "Busca en TMDB los títulos sin emparejar y los que no tienen carátula, sinopsis, fecha o nota.",
    en: "Looks up unmatched titles on TMDB and those missing a poster, overview, date or rating.",
  },
  "maintenance.providersTitle": {
    es: "Actualizar plataformas de streaming",
    en: "Refresh streaming platforms",
  },
  "maintenance.providersDescription": {
    es: "Descarga de TMDB en qué plataformas está cada título que aún no tenga ese dato.",
    en: "Fetches from TMDB which platforms carry each title that doesn't have that data yet.",
  },
  "maintenance.rematchTitle": {
    es: "Volver a buscar todas las coincidencias",
    en: "Re-match every title",
  },
  "maintenance.rematchDescription": {
    es: "Empareja otra vez cada título con TMDB (y Plex, si lo tienes) y sobrescribe sus datos. No toca los que corregiste a mano.",
    en: "Matches every title with TMDB again (and Plex, if set up) and overwrites its data. Titles you fixed by hand are left alone.",
  },
  "maintenance.rematchConfirmTitle": {
    es: "¿Volver a buscar todas las coincidencias?",
    en: "Re-match every title?",
  },
  "maintenance.rematchConfirmDescription": {
    es: "Se repite la búsqueda de cada título y se sobrescriben sus datos. Tarda unos 4 minutos por cada 1.000 títulos.",
    en: "Every title is looked up again and its data overwritten. It takes about 4 minutes per 1,000 titles.",
  },
  "maintenance.removesAutoMatches": {
    es: "Las coincidencias automáticas actuales, si TMDB devuelve otra",
    en: "Current automatic matches, if TMDB returns a different one",
  },
  "maintenance.run": { es: "Ejecutar", en: "Run" },
  "maintenance.rematchButton": { es: "Volver a buscar", en: "Re-match" },
  "maintenance.running": { es: "En curso…", en: "Running…" },
  "maintenance.done": { es: "Hecho.", en: "Done." },
  "maintenance.started": {
    es: "En marcha en segundo plano. Puede tardar unos minutos.",
    en: "Running in the background. It may take a few minutes.",
  },
} as const;

export function t(
  language: AppLanguage,
  key: keyof typeof messages,
  vars?: Record<string, string | number>,
) {
  let value: string = messages[key][language];
  if (!vars) return value;
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.split(`{${name}}`).join(String(replacement));
  }
  return value;
}
