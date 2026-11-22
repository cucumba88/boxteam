import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppIcon, { type IconName } from "../AppIcon";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import type { WizardConfig } from "./types";
import { WizardFooter, wizardSectionCard, wizardSubtext } from "./wizardUi";

export type ConfirmEditTarget = "ftp" | "tmdb" | "downloads";

const responsiveSummaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--color-text)",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
};

function SummaryCard({
  icon,
  title,
  editLabel,
  onEdit,
  children,
}: {
  icon: IconName;
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...wizardSectionCard, minWidth: 0, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-primary)",
            background: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
            flexShrink: 0,
          }}
        >
          <AppIcon name={icon} size={16} strokeWidth={2.1} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", flex: 1 }}>
          {title}
        </div>
        <button
          type="button"
          onClick={onEdit}
          style={{
            background: "none",
            border: "none",
            padding: "4px 2px",
            font: "inherit",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-primary)",
            cursor: "pointer",
          }}
        >
          {editLabel}
        </button>
      </div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </section>
  );
}

export default function StepConfirm({
  config,
  language,
  onComplete,
  onBack,
  onEdit,
}: {
  config: WizardConfig;
  language: AppLanguage;
  onComplete: (options?: { startIndexing?: boolean }) => void;
  onBack: () => void;
  onEdit: (target: ConfirmEditTarget) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const save = async () => {
    setSaving(true);
    setErrorMsg("");
    try {
      const seeded = await invoke<boolean>("seed_starter_library");
      await invoke("save_config", { config });
      await invoke("set_max_concurrent", {
        max: config.max_concurrent_downloads ?? 2,
      });
      onComplete({ startIndexing: !seeded });
    } catch (error: unknown) {
      setErrorMsg(String(error));
      setSaving(false);
    }
  };

  const editLabel = t(language, "wizard.edit");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={responsiveSummaryGrid}>
        <SummaryCard
          icon="folder"
          title={t(language, "wizard.stepFtp")}
          editLabel={editLabel}
          onEdit={() => onEdit("ftp")}
        >
          <div style={valueStyle}>
            {config.ftp_user}@{config.ftp_host}:{config.ftp_port}
          </div>
          <div style={{ ...wizardSubtext, overflowWrap: "anywhere" }}>
            {config.ftp_root || "/"}
            {config.ftp_tls ? " · FTPS" : ""}
          </div>
        </SummaryCard>

        <SummaryCard
          icon="search"
          title={t(language, "wizard.tmdbShort")}
          editLabel={editLabel}
          onEdit={() => onEdit("tmdb")}
        >
          <div style={valueStyle}>{t(language, "wizard.tmdbConfigured")}</div>
          <div style={wizardSubtext}>
            {t(language, "settings.defaultLanguage")}:{" "}
            {config.default_language === "en"
              ? t(language, "common.languageEnglish")
              : t(language, "common.languageSpanish")}
          </div>
        </SummaryCard>

        <SummaryCard
          icon="download"
          title={t(language, "settings.downloadsTitle")}
          editLabel={editLabel}
          onEdit={() => onEdit("downloads")}
        >
          {config.download_folder ? (
            <div style={valueStyle}>{config.download_folder}</div>
          ) : (
            <div style={{ ...valueStyle, fontWeight: 600, color: "var(--color-text-muted)" }}>
              {t(language, "wizard.downloadFolderUnset")}
            </div>
          )}
          <div style={wizardSubtext}>
            {t(language, "settings.maxConcurrent")}: {config.max_concurrent_downloads}
          </div>
        </SummaryCard>
      </div>

      {errorMsg && (
        <div role="alert" style={{ ...wizardSubtext, color: "var(--color-danger)" }}>
          {errorMsg}
        </div>
      )}

      <WizardFooter
        language={language}
        onBack={onBack}
        onNext={save}
        nextTone="success"
        nextBusy={saving}
        nextLabel={
          saving ? t(language, "wizard.preparingLibrary") : t(language, "wizard.finishSetup")
        }
      />
    </div>
  );
}
