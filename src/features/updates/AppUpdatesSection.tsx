import { useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import Button from "../../components/ui/Button";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import {
  checkForUpdate,
  downloadPercent,
  installUpdate,
  useAppUpdate,
} from "./updateStore";
import UpdateProgress from "./UpdateProgress";

const muted = { fontSize: 12, lineHeight: 1.5, color: "var(--color-text-muted)" } as const;

/** Settings → Sistema → "Actualizaciones": current version, manual check and install. */
export default function AppUpdatesSection({
  language,
  currentVersion,
}: {
  language: AppLanguage;
  currentVersion: string;
}) {
  const update = useAppUpdate();
  // First visit before the automatic check ran: find out now (also tells
  // portable / .deb installs that they update by reinstalling).
  useEffect(() => {
    if (update.status === "idle") void checkForUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busy =
    update.status === "checking" || update.status === "downloading" || update.status === "restarting";
  const canInstall = update.version !== null && (update.status === "available" || update.status === "error");
  const percent = downloadPercent(update);

  const statusLine = (() => {
    switch (update.status) {
      case "unsupported":
        return { text: t(language, "updates.unsupported"), tone: "muted" as const };
      case "checking":
        return { text: t(language, "updates.checking"), tone: "muted" as const };
      case "upToDate":
        return { text: t(language, "updates.upToDate"), tone: "success" as const };
      case "available":
        return {
          text: t(language, "updates.available", { version: update.version ?? "" }),
          tone: "accent" as const,
        };
      case "downloading":
        return {
          text:
            percent === null
              ? t(language, "updates.downloading")
              : t(language, "updates.downloadingPercent", { percent }),
          tone: "muted" as const,
        };
      case "restarting":
        return { text: t(language, "updates.restarting"), tone: "muted" as const };
      case "error":
        return {
          text: update.version ? t(language, "updates.installFailed") : t(language, "updates.checkFailed"),
          tone: "danger" as const,
        };
      default:
        return null;
    }
  })();

  const toneColor = {
    muted: "var(--color-text-muted)",
    success: "var(--color-success)",
    accent: "var(--color-primary)",
    danger: "var(--color-danger)",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>
            {t(language, "updates.currentVersion", { version: currentVersion })}
          </div>
          {statusLine && (
            <div role="status" style={{ ...muted, marginTop: 2, color: toneColor[statusLine.tone] }}>
              {statusLine.text}
            </div>
          )}
          {update.status === "error" && update.error && (
            <div style={{ ...muted, marginTop: 2, fontFamily: "ui-monospace, Menlo, monospace" }}>
              {update.error}
            </div>
          )}
        </div>
        {update.status !== "unsupported" &&
          update.status !== "downloading" &&
          update.status !== "restarting" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canInstall ? (
              <Button variant="primary" size="sm" icon={Download} onClick={() => void installUpdate()}>
                {t(language, "updates.install")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                disabled={busy}
                aria-busy={update.status === "checking"}
                onClick={() => void checkForUpdate({ manual: true })}
              >
                {update.status === "checking" ? t(language, "updates.checking") : t(language, "updates.check")}
              </Button>
            )}
          </div>
        )}
      </div>
      {(update.status === "downloading" || update.status === "restarting") && (
        <UpdateProgress percent={update.status === "restarting" ? 100 : percent} />
      )}
      <span style={muted}>{t(language, "updates.help")}</span>
    </div>
  );
}
