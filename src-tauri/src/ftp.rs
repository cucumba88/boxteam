use std::sync::{Arc, OnceLock};
use suppaftp::tokio::{AsyncRustlsConnector, AsyncRustlsFtpStream};
use suppaftp::types::FileType;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Utc};

/// suppaftp formats addresses with backtick+quote: `"host:port"` — strip that.
fn clean_ftp_error(e: impl std::fmt::Display) -> String {
    e.to_string().replace("`\"", "").replace("\"`", "")
}

/// Classify an FTP error message as transient (worth retrying) vs. permanent.
///
/// We intentionally pattern-match on the human-readable error text rather than
/// the underlying `std::io::ErrorKind` because suppaftp surfaces most failures
/// as `FtpError::ConnectionError(io::Error)` whose Display is the only stable
/// surface across versions.  Matches are case-insensitive substrings.
pub fn is_transient_ftp_error(e: &str) -> bool {
    let s = e.to_lowercase();
    // Never retry an explicit cancellation.
    if s.contains("cancelled") { return false; }
    // Permission / auth — these will never recover by retrying.
    if s.contains("530") { return false; }
    // Local file read failure — disk problem on our side, retry is pointless.
    if s.contains("cannot open local file") { return false; }
    if s.contains("read error:") { return false; }
    // Server-side / network transients.
    const TRANSIENT_NEEDLES: &[&str] = &[
        "broken pipe",
        "connection reset",
        "connection aborted",
        "connection closed",
        "unexpected eof",
        "timed out",
        "timeout",
        "eof while reading",
        "421", // service not available / too many connections
        "425", // can't open data connection
        "426", // transfer aborted
        "450", // file unavailable
        "451", // local error
    ];
    TRANSIENT_NEEDLES.iter().any(|n| s.contains(n))
}

/// Translate a raw FTP/IO error string into a Spanish, user-facing message.
/// Falls back to the original string when no rule matches.
pub fn humanize_ftp_error(raw: &str) -> String {
    let s = raw.to_lowercase();
    let map: &[(&str, &str)] = &[
        // FTPS-specific — must come before the generic "530" rule.
        ("must use encryption", "El servidor exige FTPS: activa «Usar FTPS» en la configuración FTP"),
        ("invalid peer certificate", "Certificado TLS del servidor no válido (¿autofirmado?). Si confías en el servidor, activa «Aceptar certificados autofirmados»"),
        ("auth tls) failed", "El servidor no admite FTPS (AUTH TLS). Desactiva «Usar FTPS»"),
        ("broken pipe", "Conexión interrumpida durante la transferencia"),
        ("connection reset", "Conexión cerrada por el servidor"),
        ("connection aborted", "Conexión cerrada por el servidor"),
        ("connection closed", "Conexión cerrada por el servidor"),
        ("unexpected eof", "Conexión cerrada de forma inesperada"),
        ("eof while reading", "Conexión cerrada de forma inesperada"),
        ("timed out", "Tiempo de espera agotado"),
        ("timeout", "Tiempo de espera agotado"),
        ("421", "Servidor FTP saturado (demasiadas conexiones simultáneas)"),
        ("425", "No se pudo abrir el canal de datos FTP"),
        ("426", "Transferencia cancelada por el servidor"),
        ("530", "Credenciales FTP rechazadas por el servidor"),
        ("550", "El servidor rechazó la operación (permiso o ruta inválida)"),
        ("cannot open local file", "No se pudo leer el archivo local"),
    ];
    for (needle, msg) in map {
        if s.contains(needle) {
            return (*msg).to_string();
        }
    }
    raw.to_string()
}

/// Best-effort: enable TCP keepalive on a stream so a half-dead FTP connection
/// surfaces as an error promptly instead of hanging until the OS default
/// (~2 hours on Linux). Errors are silently ignored — a failed keepalive isn't
/// worth aborting the upload over.
#[cfg(unix)]
fn apply_keepalive<S: std::os::unix::io::AsRawFd>(stream: &S) {
    use std::os::unix::io::BorrowedFd;
    let raw = stream.as_raw_fd();
    // SAFETY: `stream` is borrowed for the lifetime of this call and owns the
    // fd, so the BorrowedFd we construct here can't outlive it.
    let borrowed = unsafe { BorrowedFd::borrow_raw(raw) };
    let sock = socket2::SockRef::from(&borrowed);
    let ka = socket2::TcpKeepalive::new()
        .with_time(std::time::Duration::from_secs(30))
        .with_interval(std::time::Duration::from_secs(10));
    let _ = sock.set_tcp_keepalive(&ka);
}

#[cfg(not(unix))]
fn apply_keepalive<S>(_stream: &S) {
    // Non-Unix targets fall through silently; the desktop and docker
    // deployments are macOS/Linux so this is acceptable.
}

/// Like [`clean_ftp_error`] but also scrubs the FTP password from the message
/// in case a misbehaving server echoes it back in an error (e.g. "530 Login
/// incorrect: cucumba88:hunter2"). Only used at the login/connect boundary
/// where the password is in scope.
fn clean_ftp_error_redacted(e: impl std::fmt::Display, secret: &str) -> String {
    let s = clean_ftp_error(e);
    if secret.is_empty() {
        s
    } else {
        s.replace(secret, "***")
    }
}

/// The FTP stream type used everywhere. It is TLS-capable, but stays plain
/// FTP unless [`FtpEndpoint::tls`] is set, in which case `connect()` upgrades
/// it with `AUTH TLS` (explicit FTPS) before sending credentials.
type FtpConn = AsyncRustlsFtpStream;

/// Everything needed to open an authenticated FTP/FTPS session.
#[derive(Clone)]
pub struct FtpEndpoint {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub pass: String,
    /// Explicit FTPS (`AUTH TLS` + `PROT P`). `false` = plain FTP.
    pub tls: bool,
    /// Skip certificate verification (self-signed certificates). Only
    /// meaningful when `tls` is true. Encrypts but does not authenticate the
    /// server, so it is still vulnerable to an active MITM.
    pub tls_accept_invalid_certs: bool,
}

impl std::fmt::Debug for FtpEndpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FtpEndpoint")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("user", &self.user)
            .field("pass", &"***")
            .field("tls", &self.tls)
            .field("tls_accept_invalid_certs", &self.tls_accept_invalid_certs)
            .finish()
    }
}

impl FtpEndpoint {
    pub fn from_config(c: &crate::db::AppConfig) -> Self {
        Self {
            host: c.ftp_host.clone(),
            port: c.ftp_port,
            user: c.ftp_user.clone(),
            pass: c.ftp_pass.clone(),
            tls: c.ftp_tls,
            tls_accept_invalid_certs: c.ftp_tls_accept_invalid_certs,
        }
    }
}

/// Certificate verifier that accepts any server certificate but still checks
/// the handshake signatures. Used only when the user explicitly opts in to
/// self-signed certificates.
#[derive(Debug)]
struct AcceptAnyServerCert(Arc<rustls::crypto::CryptoProvider>);

impl rustls::client::danger::ServerCertVerifier for AcceptAnyServerCert {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

/// Shared rustls configs (one verifying, one permissive). Sharing them keeps
/// the TLS session cache alive across connections, which servers that require
/// session reuse on the data channel (vsftpd `require_ssl_reuse`) rely on.
fn tls_client_config(accept_invalid_certs: bool) -> Result<Arc<rustls::ClientConfig>, String> {
    static STRICT: OnceLock<Arc<rustls::ClientConfig>> = OnceLock::new();
    static PERMISSIVE: OnceLock<Arc<rustls::ClientConfig>> = OnceLock::new();
    let cell = if accept_invalid_certs { &PERMISSIVE } else { &STRICT };
    if let Some(cfg) = cell.get() {
        return Ok(cfg.clone());
    }
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let builder = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("TLS: {e}"))?;
    let cfg = if accept_invalid_certs {
        builder
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AcceptAnyServerCert(provider)))
            .with_no_client_auth()
    } else {
        let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        builder.with_root_certificates(roots).with_no_client_auth()
    };
    Ok(cell.get_or_init(|| Arc::new(cfg)).clone())
}

/// Reject any value that would be sent on the FTP control channel if it
/// contains CR, LF or NUL. suppaftp < 10 does not escape these, so a crafted
/// path, filename or credential could inject extra FTP commands
/// (RUSTSEC-2026-0271). Remove once suppaftp is upgraded to >= 10.0.2.
fn reject_control_chars(label: &str, value: &str) -> Result<(), String> {
    if value.contains(['\r', '\n', '\0']) {
        return Err(format!("{label} contiene caracteres de control no permitidos"));
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FtpFile {
    pub path: String,
    pub size: u64,
    pub filename: String,
    pub modified_at: Option<String>,
}

const MEDIA_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "m2ts", "mov", "ts"];

/// Open a TCP connection and, when FTPS is enabled, upgrade it with
/// `AUTH TLS` before anything sensitive is sent. Does not log in.
async fn open(ep: &FtpEndpoint) -> Result<FtpConn, String> {
    reject_control_chars("Usuario FTP", &ep.user)?;
    reject_control_chars("Contraseña FTP", &ep.pass)?;
    let host = ep.host.trim();
    let ftp = FtpConn::connect(format!("{host}:{}", ep.port))
        .await
        .map_err(|e| format!("Cannot connect to {host}:{}: {}", ep.port, clean_ftp_error_redacted(e, &ep.pass)))?;
    apply_keepalive(&*ftp.get_ref().await);
    if !ep.tls {
        return Ok(ftp);
    }
    let cfg = tls_client_config(ep.tls_accept_invalid_certs)?;
    let connector = AsyncRustlsConnector::from(tokio_rustls::TlsConnector::from(cfg));
    // IPv6 literals may arrive bracketed; rustls wants the bare address.
    let domain = host.trim_start_matches('[').trim_end_matches(']');
    ftp.into_secure(connector, domain)
        .await
        .map_err(|e| format!("FTPS (AUTH TLS) failed: {}", clean_ftp_error_redacted(e, &ep.pass)))
}

/// Open a fresh authenticated FTP/FTPS connection.
async fn connect(ep: &FtpEndpoint) -> Result<FtpConn, String> {
    let mut ftp = open(ep).await?;
    ftp.login(ep.user.as_str(), ep.pass.as_str())
        .await
        .map_err(|e| clean_ftp_error_redacted(e, &ep.pass))?;
    Ok(ftp)
}

/// Parse raw FTP LIST lines into (is_dir, name, size) tuples.
fn parse_entries(raw: &[String], parent_path: &str) -> (Vec<String>, Vec<FtpFile>) {
    let mut dirs = vec![];
    let mut files = vec![];
    for entry in raw {
        let entry = entry.trim().to_string();
        if entry.is_empty() { continue; }
        let parts: Vec<&str> = entry.split_whitespace().collect();
        let (is_dir, name_start, size, modified_at) = if parts.len() >= 9
            && (parts[0].starts_with('-') || parts[0].starts_with('d') || parts[0].starts_with('l'))
        {
            let is_dir = parts[0].starts_with('d');
            let size: u64 = parts[4].parse().unwrap_or(0);
            (
                is_dir,
                8usize,
                size,
                parse_unix_list_modified(&parts),
            )
        } else if parts.len() >= 4 && parts[0].contains('-') && parts[1].contains(':') {
            let is_dir = parts[2].eq_ignore_ascii_case("<DIR>");
            let size: u64 = if is_dir { 0 } else { parts[2].parse().unwrap_or(0) };
            (
                is_dir,
                3usize,
                size,
                parse_windows_list_modified(&parts),
            )
        } else {
            continue;
        };
        if name_start >= parts.len() { continue; }
        let name = parts[name_start..].join(" ");
        let name = name.trim().to_string();
        if name == "." || name == ".." || name.is_empty() { continue; }
        // A name with control characters would be echoed back on CWD/MDTM
        // and could smuggle extra FTP commands — skip it.
        if name.contains(['\r', '\n', '\0']) { continue; }
        let child_path = format!("{}/{}", parent_path.trim_end_matches('/'), name);
        if is_dir {
            dirs.push(child_path);
        } else {
            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if MEDIA_EXTENSIONS.contains(&ext.as_str()) {
                files.push(FtpFile {
                    path: child_path,
                    size,
                    filename: name,
                    modified_at: modified_at.map(|value| value.to_rfc3339()),
                });
            }
        }
    }
    (dirs, files)
}

/// MDTM replies are UTC (RFC 3659); suppaftp hands them back as a civil time.
fn civil_to_utc(c: jiff::civil::DateTime) -> Option<DateTime<Utc>> {
    let naive = NaiveDate::from_ymd_opt(c.year() as i32, c.month() as u32, c.day() as u32)?
        .and_hms_opt(c.hour() as u32, c.minute() as u32, c.second() as u32)?;
    Some(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc))
}

fn normalize_ftp_modified(dt: DateTime<Utc>) -> DateTime<Utc> {
    let now = Utc::now();
    if dt > now + chrono::Duration::days(1) {
        if let Some(one_year_back) = dt.with_year(dt.year() - 1) {
            return one_year_back;
        }
        return dt - chrono::Duration::days(365);
    }
    dt
}

fn parse_unix_list_modified(parts: &[&str]) -> Option<DateTime<Utc>> {
    if parts.len() < 8 {
        return None;
    }

    let month = parts[5];
    let day = parts[6];
    let year_or_time = parts[7];
    let now = Utc::now();

    let naive = if year_or_time.contains(':') {
        NaiveDateTime::parse_from_str(
            &format!("{month} {day} {} {year_or_time}", now.year()),
            "%b %e %Y %H:%M",
        )
        .ok()
    } else {
        NaiveDate::parse_from_str(
            &format!("{month} {day} {year_or_time}"),
            "%b %e %Y",
        )
        .ok()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
    }?;

    Some(normalize_ftp_modified(DateTime::<Utc>::from_naive_utc_and_offset(
        naive,
        Utc,
    )))
}

fn parse_windows_list_modified(parts: &[&str]) -> Option<DateTime<Utc>> {
    if parts.len() < 2 {
        return None;
    }

    let raw = format!("{} {}", parts[0], parts[1]);
    let naive = NaiveDateTime::parse_from_str(&raw, "%m-%d-%y %I:%M%p")
        .or_else(|_| NaiveDateTime::parse_from_str(&raw, "%m-%d-%Y %I:%M%p"))
        .or_else(|_| NaiveDateTime::parse_from_str(&raw, "%m-%d-%y %H:%M"))
        .or_else(|_| NaiveDateTime::parse_from_str(&raw, "%m-%d-%Y %H:%M"))
        .ok()?;

    Some(normalize_ftp_modified(DateTime::<Utc>::from_naive_utc_and_offset(
        naive,
        Utc,
    )))
}

pub async fn test_connection(ep: &FtpEndpoint) -> Result<(), String> {
    // Shown verbatim in the wizard / settings, so translate known failures
    // (FTPS required, bad certificate, wrong credentials…) into Spanish.
    let mut ftp = open(ep).await.map_err(|e| humanize_ftp_error(&e))?;
    ftp.login(ep.user.as_str(), ep.pass.as_str())
        .await
        .map_err(|e| humanize_ftp_error(&format!("Login failed: {}", clean_ftp_error_redacted(e, &ep.pass))))?;
    ftp.quit().await.ok();
    Ok(())
}

/// Delete a single file on the FTP server at `remote_dir/filename`.
pub async fn delete_file(
    ep: &FtpEndpoint,
    remote_dir: &str,
    filename: &str,
) -> Result<(), String> {
    reject_control_chars("Ruta remota", remote_dir)?;
    reject_control_chars("Nombre de archivo", filename)?;
    let mut ftp = connect(ep).await?;
    let full_path = format!("{}/{}", remote_dir.trim_end_matches('/'), filename);
    ftp.rm(&full_path)
        .await
        .map_err(|e| format!("DELE {full_path}: {}", clean_ftp_error(e)))?;
    ftp.quit().await.ok();
    Ok(())
}

pub async fn list_raw(
    ep: &FtpEndpoint,
    path: &str,
) -> Result<Vec<String>, String> {
    reject_control_chars("Ruta remota", path)?;
    let mut ftp = connect(ep).await?;
    ftp.cwd(path).await.map_err(|e| format!("CWD {path}: {e}"))?;
    let entries = ftp.list(None).await.map_err(|e| e.to_string())?;
    ftp.quit().await.ok();
    Ok(entries)
}

/// List a subdirectory relative to a parent path without CWD-ing into the
/// subdirectory. This avoids FTP CWD failures when the subdir name contains
/// non-ASCII characters that may be mangled by the UTF-8 conversion of the
/// LIST response (e.g. Latin-1 "Temporadas en emisión" ó → replacement char).
///
/// Strategy: CWD to `parent_path` (parent is usually ASCII-safe), then send
/// `LIST subdir` as a relative path argument so the server uses its native
/// path without us re-encoding the accented characters.
pub async fn list_raw_sub(
    ep: &FtpEndpoint,
    parent_path: &str,
    subdir: &str,
) -> Result<Vec<String>, String> {
    reject_control_chars("Ruta remota", parent_path)?;
    reject_control_chars("Subcarpeta", subdir)?;
    let mut ftp = connect(ep).await?;
    ftp.cwd(parent_path).await.map_err(|e| format!("CWD {parent_path}: {e}"))?;
    // Pass subdir as the LIST argument — avoids a second CWD with a potentially
    // broken UTF-8 string derived from a Latin-1 FTP response.
    let entries = ftp.list(Some(subdir)).await.map_err(|e| e.to_string())?;
    ftp.quit().await.ok();
    Ok(entries)
}

/// Crawl `root` using a pool of N concurrent FTP connections draining a shared
/// work queue (breadth-first parallel scan).
///
/// Unlike the old approach (one connection per top-level branch, sequential
/// within), every discovered sub-directory is pushed back to the shared queue,
/// so all N workers stay busy at every depth level.  This gives an O(N× depth)
/// speed-up on wide server libraries.
pub async fn list_files(
    ep: &FtpEndpoint,
    root: &str,
    on_log: Arc<dyn Fn(String) + Send + Sync>,
) -> Result<Vec<FtpFile>, String> {
    const MAX_WORKERS: usize = 8;
    reject_control_chars("Ruta raíz", root)?;

    // Seed: one shallow scan of root to populate the initial queue.
    on_log(format!("Connected — discovering root entries in {root}"));
    let mut root_ftp = connect(ep).await?;
    root_ftp.cwd(root).await.map_err(|e| format!("CWD {root}: {e}"))?;
    let root_entries = root_ftp.list(None).await.map_err(|e| e.to_string())?;
    root_ftp.quit().await.ok();

    let (top_dirs, root_files) = parse_entries(&root_entries, root);
    on_log(format!(
        "Found {} top-level entries — launching {} workers",
        top_dirs.len(),
        MAX_WORKERS,
    ));

    // Shared state across workers.
    let queue: Arc<tokio::sync::Mutex<std::collections::VecDeque<String>>> =
        Arc::new(tokio::sync::Mutex::new(top_dirs.into()));
    let all_files: Arc<tokio::sync::Mutex<Vec<FtpFile>>> =
        Arc::new(tokio::sync::Mutex::new(root_files));
    // Number of workers currently holding an item from the queue.
    // When queue is empty AND busy == 0, the crawl is complete.
    let busy = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    // Wakes idle workers when new directories are queued or a busy worker
    // finishes (instead of polling the queue every few milliseconds).
    let wake = Arc::new(tokio::sync::Notify::new());

    let mut handles = vec![];

    for _ in 0..MAX_WORKERS {
        let queue = queue.clone();
        let all_files = all_files.clone();
        let busy = busy.clone();
        let wake = wake.clone();
        let log = on_log.clone();
        let ep = ep.clone();

        handles.push(tokio::spawn(async move {
            // Each worker opens and reuses its own FTP connection.
            let mut ftp = match connect(&ep).await {
                Ok(f) => f,
                Err(e) => {
                    log(format!("⚠ Worker failed to connect: {e}"));
                    return;
                }
            };

            loop {
                // Register for a wake-up *before* inspecting the queue so a
                // notify that lands in between is not lost.
                let notified = wake.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();

                // Pop a directory from the queue, incrementing busy *before*
                // releasing the lock so the "done" check is race-free.
                let dir = {
                    let mut q = queue.lock().await;
                    let item = q.pop_front();
                    if item.is_some() {
                        busy.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    }
                    item
                };

                let dir = match dir {
                    Some(d) => d,
                    None => {
                        // Queue is empty. If no other worker is busy, all
                        // directories have been processed — we're done.
                        if busy.load(std::sync::atomic::Ordering::SeqCst) == 0 {
                            wake.notify_waiters();
                            break;
                        }
                        // Another worker is still active and may push more dirs.
                        notified.await;
                        continue;
                    }
                };

                // CWD + LIST this directory. If the control connection died
                // (server idle timeout, network blip), reconnect once and
                // retry: otherwise every later directory this worker pops
                // would fail too and its media would be missing from the scan.
                let mut listed = list_one_dir(&mut ftp, &dir).await;
                if let Err(e) = &listed {
                    if is_transient_ftp_error(e) {
                        match connect(&ep).await {
                            Ok(fresh) => {
                                log(format!("↻ Reconnected after: {e}"));
                                ftp = fresh;
                                listed = list_one_dir(&mut ftp, &dir).await;
                            }
                            Err(ce) => log(format!("⚠ Reconnect failed: {ce}")),
                        }
                    }
                }

                match listed {
                    Ok((sub_dirs, mut files)) => {
                        // MDTM fallback for files whose date LIST couldn't parse.
                        // We're still CWD'd in `dir` so filename-only MDTM works.
                        for file in &mut files {
                            if file.modified_at.is_none() {
                                if let Ok(civil) = ftp.mdtm(&file.filename).await {
                                    if let Some(dt) = civil_to_utc(civil) {
                                        file.modified_at = Some(normalize_ftp_modified(dt).to_rfc3339());
                                    }
                                }
                            }
                        }

                        if !files.is_empty() {
                            log(format!("🎬 {} file(s) in {}", files.len(), dir));
                        }

                        // Push subdirectories back to the shared queue.
                        if !sub_dirs.is_empty() {
                            let mut q = queue.lock().await;
                            for d in sub_dirs {
                                q.push_back(d);
                            }
                        }

                        all_files.lock().await.extend(files);
                    }
                    Err(e) => log(format!("⚠ {e}")),
                }

                busy.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                wake.notify_waiters();
            }

            ftp.quit().await.ok();
        }));
    }

    for handle in handles {
        handle.await.ok();
    }

    let result = Arc::try_unwrap(all_files)
        .map_err(|_| "Internal error: Arc still shared after crawl".to_string())?
        .into_inner();

    if result.is_empty() {
        return Err("FTP crawl returned 0 media files. Check your Root Path setting.".into());
    }

    on_log(format!("Crawl complete — {} media files found", result.len()));
    Ok(result)
}

/// CWD into `path` then LIST it, returning (subdirectories, media files).
async fn list_one_dir(
    ftp: &mut FtpConn,
    path: &str,
) -> Result<(Vec<String>, Vec<FtpFile>), String> {
    ftp.cwd(path).await.map_err(|e| format!("CWD {path}: {e}"))?;
    let raw = ftp.list(None).await.map_err(|e| format!("LIST in {path}: {e}"))?;
    Ok(parse_entries(&raw, path))
}

pub async fn download_file(
    ep: &FtpEndpoint,
    remote_path: &str,
    local_path: &str,
    on_progress: impl Fn(u64, u64) -> bool,
) -> Result<(), String> {
    reject_control_chars("Ruta remota", remote_path)?;
    let mut ftp = connect(ep).await?;
    ftp.transfer_type(FileType::Binary)
        .await
        .map_err(|e| e.to_string())?;

    let size = ftp.size(remote_path).await.unwrap_or(0) as u64;
    let existing_size = tokio::fs::metadata(local_path)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);

    if size > 0 && existing_size >= size {
        ftp.quit().await.ok();
        return Ok(());
    }

    if existing_size > 0 {
        if let Err(_) = ftp.resume_transfer(existing_size as usize).await {
            tokio::fs::remove_file(local_path).await.ok();
            ftp.transfer_type(FileType::Binary)
                .await
                .map_err(|e| e.to_string())?;
            return Err("Resume failed and partial file was removed. Download will restart on retry.".to_string());
        }
    }

    let mut reader = ftp
        .retr_as_stream(remote_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut file = if existing_size > 0 {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(local_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        tokio::fs::File::create(local_path)
            .await
            .map_err(|e| e.to_string())?
    };
    let mut downloaded = existing_size;
    let mut buf = vec![0u8; 65536];
    let mut cancelled = false;

    if downloaded > 0 && !on_progress(downloaded, size) {
        cancelled = true;
    }

    while !cancelled {
        let n = reader.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        if let Err(e) = file.write_all(&buf[..n]).await {
            drop(file);
            tokio::fs::remove_file(local_path).await.ok();
            return Err(format!("Write error: {e}"));
        }
        downloaded += n as u64;
        if !on_progress(downloaded, size) {
            cancelled = true;
            break;
        }
    }

    // Close the data channel and read the 226 reply. A dropped (cancelled)
    // stream defers that reply; quit() consumes it.
    let finish_err = if cancelled {
        drop(reader);
        None
    } else {
        reader.finish().await.err().map(clean_ftp_error)
    };
    ftp.quit().await.ok();

    if cancelled {
        tokio::fs::remove_file(local_path).await.ok();
        return Err("Cancelled".to_string());
    }

    // If the server reported a size and we didn't receive all of it, the stream
    // ended prematurely (connection drop, timeout, etc.). Remove the incomplete
    // file so the next retry starts fresh rather than showing it as Done.
    if size > 0 && downloaded < size {
        tokio::fs::remove_file(local_path).await.ok();
        return Err(format!(
            "Download incomplete: received {} of {} bytes. Will retry automatically.",
            downloaded, size
        ));
    }
    // Without a SIZE reply the server's completion code is the only signal.
    if size == 0 {
        if let Some(e) = finish_err {
            return Err(format!("Download failed: {e}"));
        }
    }

    Ok(())
}

/// Upload a local file to the FTP server at `remote_dir/filename`.
///
/// `remote_dir` is created recursively if it does not exist.
/// `on_progress(bytes_done, bytes_total)` is called periodically; returning
/// `false` cancels the transfer.
pub async fn upload_file(
    ep: &FtpEndpoint,
    remote_dir: &str,
    filename: &str,
    local_path: &str,
    on_progress: impl Fn(u64, u64) -> bool,
) -> Result<(), String> {
    reject_control_chars("Ruta remota", remote_dir)?;
    reject_control_chars("Nombre de archivo", filename)?;
    let file_size = tokio::fs::metadata(local_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    let mut ftp = connect(ep).await?;
    ftp.transfer_type(FileType::Binary).await.map_err(|e| clean_ftp_error(e))?;

    // Ensure remote directory exists (create each segment, ignore "already exists").
    ensure_remote_dir(&mut ftp, remote_dir).await?;

    // CWD into the target dir.
    ftp.cwd(remote_dir).await.map_err(|e| format!("CWD {remote_dir}: {}", clean_ftp_error(e)))?;

    // Open local file.
    let local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("Cannot open local file: {e}"))?;

    let remote_full = format!("{}/{}", remote_dir.trim_end_matches('/'), filename);

    // Open FTP data stream for writing — progress is reported as bytes are
    // actually written to the socket, so 100% only fires when the transfer is done.
    let mut data_stream = ftp
        .put_with_stream(filename)
        .await
        .map_err(|e| format!("Cannot start upload for {remote_full}: {}", clean_ftp_error(e)))?;

    // Disable Nagle's algorithm so each chunk goes out immediately without
    // waiting to coalesce with the next write.
    data_stream.get_ref().get_ref().set_nodelay(true).ok();
    // Keepalive on the data stream — long uploads of large files can otherwise
    // exceed the server's idle timeout on the data channel.
    apply_keepalive(data_stream.get_ref().get_ref());

    // Double-buffer: while writing chunk N to the socket, read chunk N+1 from
    // disk in parallel.  This keeps both I/O paths busy and avoids idle time.
    const CHUNK: usize = 2 * 1024 * 1024; // 2 MB
    let mut buf_a = vec![0u8; CHUNK];
    let mut buf_b = vec![0u8; CHUNK];
    let mut reader = local_file;
    let mut uploaded: u64 = 0;
    let mut cancelled = false;

    // Prime the pump — read the first chunk before entering the loop.
    let mut n = reader
        .read(&mut buf_a)
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    loop {
        if n == 0 {
            break;
        }

        // Send buf_a to FTP and simultaneously read the next chunk into buf_b.
        let (write_res, read_res) = tokio::join!(
            data_stream.write_all(&buf_a[..n]),
            reader.read(&mut buf_b)
        );

        write_res.map_err(|e| format!("Write error for {remote_full}: {e}"))?;
        uploaded += n as u64;

        if !on_progress(uploaded, file_size) {
            cancelled = true;
            break;
        }

        n = read_res.map_err(|e| format!("Read error: {e}"))?;
        std::mem::swap(&mut buf_a, &mut buf_b);
    }

    if cancelled {
        ftp.abort(data_stream).await.ok();
        ftp.quit().await.ok();
        return Err("Cancelled".to_string());
    }

    // Flush the data stream and wait for the server's 226 Transfer complete.
    data_stream
        .finish()
        .await
        .map_err(|e| format!("Upload failed for {remote_full}: {}", clean_ftp_error(e)))?;

    ftp.quit().await.ok();
    Ok(())
}

/// Recursively ensure that all segments of `path` exist on the FTP server.
/// Ignores "550 directory already exists" type errors (FTP 550 is also returned
/// for other errors, so we attempt MKD and continue regardless).
async fn ensure_remote_dir(ftp: &mut FtpConn, path: &str) -> Result<(), String> {
    let mut current = String::new();
    for segment in path.split('/') {
        if segment.is_empty() {
            current.push('/');
            continue;
        }
        if current.is_empty() || current == "/" {
            current = format!("/{segment}");
        } else {
            current = format!("{current}/{segment}");
        }
        // Try MKD; ignore error (directory may already exist).
        ftp.mkdir(&current).await.ok();
    }
    Ok(())
}

/// Test whether the FTP user has write permission by attempting to create
/// and immediately remove a temporary directory.
pub async fn check_write_permission(
    ep: &FtpEndpoint,
    root: &str,
) -> Result<bool, String> {
    reject_control_chars("Ruta raíz", root)?;
    let mut ftp = connect(ep).await?;
    let test_dir = format!("{root}/.oscata-write-test");
    let writable = ftp.mkdir(&test_dir).await.is_ok();
    if writable {
        ftp.rmdir(&test_dir).await.ok();
    }
    ftp.quit().await.ok();
    Ok(writable)
}

#[cfg(test)]
mod control_char_tests {
    use super::*;

    #[test]
    fn humanizes_ftps_errors() {
        assert!(humanize_ftp_error("Login failed: Invalid response: [530] 530 Non-anonymous sessions must use encryption.").contains("exige FTPS"));
        assert!(humanize_ftp_error("FTPS (AUTH TLS) failed: Secure error: invalid peer certificate: UnknownIssuer").contains("autofirmado"));
        assert!(humanize_ftp_error("FTPS (AUTH TLS) failed: Invalid response: [530] 530 Please login with USER and PASS.").contains("no admite FTPS"));
        assert!(humanize_ftp_error("Login failed: [530] Login incorrect.").contains("Credenciales"));
    }

    #[test]
    fn rejects_crlf_and_nul() {
        assert!(reject_control_chars("x", "/media/Películas").is_ok());
        assert!(reject_control_chars("x", "a\r\nDELE b").is_err());
        assert!(reject_control_chars("x", "a\nb").is_err());
        assert!(reject_control_chars("x", "a\0b").is_err());
    }

    #[test]
    fn listing_skips_names_with_control_chars() {
        let raw = vec![
            "-rw-r--r-- 1 u g 100 Jan 01 2024 ok.mkv".to_string(),
            "-rw-r--r-- 1 u g 100 Jan 01 2024 bad\0.mkv".to_string(),
        ];
        let (_, files) = parse_entries(&raw, "/m");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].filename, "ok.mkv");
    }
}
