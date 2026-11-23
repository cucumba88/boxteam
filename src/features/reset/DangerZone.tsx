import { useState } from "react";
import AppIcon from "../../components/AppIcon";
import ConfirmDialog from "../../components/ConfirmDialog";
import { isTauri } from "../../lib/transport";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import { useAppReset, type ResetKind } from "./useAppReset";

interface DangerZoneProps {
  language: AppLanguage;
  onLibraryReset?: () => void;
}

interface ResetRowProps {
  title: string;
  description: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
}

function ResetRow({ title, description, buttonLabel, disabled, onClick }: ResetRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "14px 0",
        borderTop:
          "1px solid color-mix(in srgb, var(--color-danger) 22%, transparent)",
      }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: "9px 14px",
          borderRadius: "var(--radius-full)",
          border:
            "1px solid color-mix(in srgb, var(--color-danger) 60%, transparent)",
          background: hovered
            ? "color-mix(in srgb, var(--color-danger) 18%, transparent)"
            : "color-mix(in srgb, var(--color-danger) 8%, transparent)",
          color: "var(--color-danger)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          fontSize: 13,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "background 0.15s ease",
        }}
      >
        <AppIcon name="trash" size={15} />
        {buttonLabel}
      </button>
    </div>
  );
}

/**
 * "Zona de peligro" at the bottom of Settings: reset the library (re-index
 * from scratch) or restore factory settings. Always expanded so it's easy
 * to find; every action goes through a ConfirmDialog.
 */
export default function DangerZone({ language, onLibraryReset }: DangerZoneProps) {
  const { busy, error, clearError, resetLibrary, clearMetadata, factoryReset } =
    useAppReset({ onLibraryReset });
  const [dialog, setDialog] = useState<ResetKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    clearError();
    setDialog(null);
  };

  const confirm = async () => {
    if (dialog === "metadata") {
      if (await clearMetadata()) {
        setDialog(null);
        setNotice(t(language, "reset.metadataStarted"));
      }
      return;
    }
    const ok =
      dialog === "library" ? await resetLibrary() : await factoryReset();
    if (ok && dialog === "library") setDialog(null);
  };

  const factoryKeeps = isTauri()
    ? [t(language, "reset.keepsWebAccess")]
    : [t(language, "reset.keepsWebUsers"), t(language, "reset.keepsWebAccess")];

  return (
    <section
      aria-labelledby="danger-zone-title"
      style={{
        borderRadius: "var(--radius-lg)",
        border:
          "1px solid color-mix(in srgb, var(--color-danger) 45%, transparent)",
        background:
          "color-mix(in srgb, var(--color-danger) 5%, var(--color-surface))",
        padding: "18px 18px 4px",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-danger)",
            background:
              "color-mix(in srgb, var(--color-danger) 16%, transparent)",
            flexShrink: 0,
          }}
        >
          <AppIcon name="trash" size={18} strokeWidth={2.1} />
        </div>
        <div>
          <div
            id="danger-zone-title"
            style={{ fontSize: 15, fontWeight: 700, color: "var(--color-danger)" }}
          >
            {t(language, "reset.sectionTitle")}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-muted)" }}>
            {t(language, "reset.sectionDescription")}
          </div>
        </div>
      </div>

      <ResetRow
        title={t(language, "reset.metadataTitle")}
        description={t(language, "reset.metadataDescription")}
        buttonLabel={t(language, "reset.metadataButton")}
        disabled={busy !== null}
        onClick={() => {
          setNotice(null);
          setDialog("metadata");
        }}
      />
      {notice && (
        <div
          role="status"
          style={{
            fontSize: 12,
            color: "var(--color-success)",
            padding: "0 0 12px",
          }}
        >
          {notice}
        </div>
      )}
      <ResetRow
        title={t(language, "reset.libraryTitle")}
        description={t(language, "reset.libraryDescription")}
        buttonLabel={t(language, "reset.libraryButton")}
        disabled={busy !== null}
        onClick={() => setDialog("library")}
      />
      <ResetRow
        title={t(language, "reset.factoryTitle")}
        description={t(language, "reset.factoryDescription")}
        buttonLabel={t(language, "reset.factoryButton")}
        disabled={busy !== null}
        onClick={() => setDialog("factory")}
      />

      <ConfirmDialog
        open={dialog === "metadata"}
        title={t(language, "reset.metadataConfirmTitle")}
        description={t(language, "reset.metadataConfirmDescription")}
        removes={[t(language, "reset.removesMetadata")]}
        keeps={[
          t(language, "reset.keepsManualMatches"),
          t(language, "reset.keepsIndex"),
          t(language, "reset.keepsSettings"),
        ]}
        confirmLabel={t(language, "reset.metadataButton")}
        busyLabel={t(language, "reset.working")}
        cancelLabel={t(language, "common.cancel")}
        busy={busy === "metadata"}
        error={dialog === "metadata" ? error : null}
        onConfirm={confirm}
        onCancel={close}
      />
      <ConfirmDialog
        open={dialog === "library"}
        title={t(language, "reset.libraryConfirmTitle")}
        description={t(language, "reset.libraryConfirmDescription")}
        removes={[
          t(language, "reset.removesIndex"),
          t(language, "reset.removesMatches"),
        ]}
        keeps={[
          t(language, "reset.keepsSettings"),
          t(language, "reset.keepsWatchlist"),
          t(language, "reset.keepsFtpFiles"),
        ]}
        confirmLabel={t(language, "reset.libraryButton")}
        busyLabel={t(language, "reset.working")}
        cancelLabel={t(language, "common.cancel")}
        busy={busy === "library"}
        error={dialog === "library" ? error : null}
        onConfirm={confirm}
        onCancel={close}
      />
      <ConfirmDialog
        open={dialog === "factory"}
        title={t(language, "reset.factoryConfirmTitle")}
        description={t(language, "reset.factoryConfirmDescription")}
        removes={[
          t(language, "reset.removesIndex"),
          t(language, "reset.removesSettings"),
          t(language, "reset.removesWatchlist"),
        ]}
        keeps={[...factoryKeeps, t(language, "reset.keepsFtpFiles")]}
        confirmPhrase={t(language, "reset.factoryPhrase")}
        confirmPhrasePrompt={t(language, "reset.factoryPhrasePrompt", {
          phrase: t(language, "reset.factoryPhrase"),
        })}
        confirmLabel={t(language, "reset.factoryButton")}
        busyLabel={t(language, "reset.working")}
        cancelLabel={t(language, "common.cancel")}
        busy={busy === "factory"}
        error={dialog === "factory" ? error : null}
        onConfirm={confirm}
        onCancel={close}
      />
    </section>
  );
}
