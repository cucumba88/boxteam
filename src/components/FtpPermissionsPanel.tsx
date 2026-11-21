import { useCallback, useEffect, useState } from "react";
import AppIcon from "./AppIcon";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { call } from "../lib/transport";

/** Mirrors `ftp::FtpPermissions` in the Rust backend. */
export interface FtpPermissions {
  connected: boolean;
  tls: boolean;
  can_list: boolean;
  can_create_dirs: boolean;
  can_upload: boolean;
  /** null: nothing to try it on. */
  can_download: boolean | null;
  /** null: could not be tried (upload refused). */
  can_delete: boolean | null;
  error: string | null;
  checked_at: string;
}

/** Fired by Settings after the config is saved, so the Library can re-run its
 * upload-permission gate and this panel can re-probe. */
export const FTP_CONFIG_SAVED_EVENT = "oscata:ftp-config-saved";

type MessageKey = Parameters<typeof t>[1];

const ROWS: { key: keyof FtpPermissions; label: MessageKey; hint: MessageKey }[] = [
  { key: "can_list", label: "ftp.perm.list", hint: "ftp.perm.listHint" },
  { key: "can_download", label: "ftp.perm.download", hint: "ftp.perm.downloadHint" },
  { key: "can_upload", label: "ftp.perm.upload", hint: "ftp.perm.uploadHint" },
  { key: "can_create_dirs", label: "ftp.perm.mkdir", hint: "ftp.perm.mkdirHint" },
  { key: "can_delete", label: "ftp.perm.delete", hint: "ftp.perm.deleteHint" },
];

const boxStyle: React.CSSProperties = {
  marginTop: 14,
  borderRadius: "var(--radius)",
  border: "1px solid color-mix(in srgb, var(--color-border) 74%, transparent)",
  background: "color-mix(in srgb, var(--color-bg) 70%, transparent)",
  padding: "0.75rem 0.9rem",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const mutedStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--color-text-muted)",
};

// A missing permission isn't an error (a read-only FTP account is a valid
// setup — it just hides uploads), so "no" is shown neutral, not red.
function Mark({ ok }: { ok: boolean | null }) {
  const color = ok ? "var(--color-success)" : "var(--color-text-muted)";
  return (
    <span
      aria-hidden
      style={{
        width: 20,
        height: 20,
        flexShrink: 0,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      {ok === null ? "?" : ok ? "✓" : "–"}
    </span>
  );
}

/**
 * Settings → FTP: what the saved FTP account can actually do in the library
 * root. The backend probes it with a temporary folder and file that it
 * removes afterwards.
 */
export default function FtpPermissionsPanel({
  language,
  buttonStyle,
}: {
  language: AppLanguage;
  buttonStyle: React.CSSProperties;
}) {
  const [perms, setPerms] = useState<FtpPermissions | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState("");

  const probe = useCallback(async () => {
    setChecking(true);
    setFailure("");
    try {
      setPerms(await call<FtpPermissions>("get_ftp_permissions"));
    } catch (error: unknown) {
      setPerms(null);
      setFailure(String(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void probe();
    const onSaved = () => void probe();
    window.addEventListener(FTP_CONFIG_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(FTP_CONFIG_SAVED_EVENT, onSaved);
  }, [probe]);

  const checkedAt = perms?.checked_at
    ? new Date(perms.checked_at).toLocaleTimeString(language === "es" ? "es-ES" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div style={boxStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>
            {t(language, "ftp.perm.title")}
          </div>
          <div style={mutedStyle}>{t(language, "ftp.perm.subtitle")}</div>
        </div>
        <button type="button" onClick={() => void probe()} disabled={checking} style={buttonStyle}>
          <AppIcon name="activity" size={15} />
          {checking ? t(language, "common.testing") : t(language, "ftp.perm.recheck")}
        </button>
      </div>

      {failure && <div style={{ ...mutedStyle, color: "var(--color-danger)" }}>{failure}</div>}

      {perms && !perms.connected && (
        <div style={{ ...mutedStyle, color: "var(--color-danger)" }}>
          {t(language, "ftp.perm.notConnected")}
          {perms.error ? `: ${perms.error}` : ""}
        </div>
      )}

      {perms && perms.connected && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ROWS.map((row) => {
              const raw = perms[row.key];
              const ok = raw === null ? null : Boolean(raw);
              return (
                <div key={row.key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Mark ok={ok} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
                      {t(language, row.label)}
                    </div>
                    <div style={mutedStyle}>
                      {t(language, row.hint)}
                      {ok === null ? ` ${t(language, "ftp.perm.unknown")}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={mutedStyle}>
            {perms.can_upload ? t(language, "ftp.perm.uploadsOn") : t(language, "ftp.perm.uploadsOff")}
            {" · "}
            {perms.tls ? "FTPS" : "FTP"}
            {checkedAt ? ` · ${t(language, "ftp.perm.checkedAt")} ${checkedAt}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
