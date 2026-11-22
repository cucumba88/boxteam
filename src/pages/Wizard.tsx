import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import AppIcon, { type IconName } from "../components/AppIcon";
import BoxTeamMark from "../components/BoxTeamMark";
import StepFTP from "../components/wizard/StepFTP";
import StepTMDB from "../components/wizard/StepTMDB";
import StepDownloads from "../components/wizard/StepDownloads";
import StepDataDir from "../components/wizard/StepDataDir";
import StepConfirm, {
  type ConfirmEditTarget,
} from "../components/wizard/StepConfirm";
import type { WizardConfig } from "../components/wizard/types";
import { isTauri } from "../lib/transport";
import { t } from "../utils/i18n";
import {
  DEFAULT_FOLDER_TYPES_STRING,
  mergeInferredFolderTypes,
} from "../utils/folderTypes";
import type { AppLanguage } from "../utils/mediaLanguage";

const DEFAULT_FTP_ROOT = "/Compartida";

type StepId = "ftp" | "tmdb" | "downloads" | "storage" | "confirm";

interface StepDef {
  id: StepId;
  label: string;
  description: string;
  icon: IconName;
}

const shellCard: React.CSSProperties = {
  borderRadius: "calc(var(--radius-lg) + 6px)",
  border: "1px solid color-mix(in srgb, var(--color-border) 82%, transparent)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 97%, transparent), color-mix(in srgb, var(--color-surface-2) 94%, transparent))",
  boxShadow: "0 24px 80px color-mix(in srgb, black 30%, transparent)",
};

const sectionCard: React.CSSProperties = {
  borderRadius: "var(--radius-lg)",
  border: "1px solid color-mix(in srgb, var(--color-border) 76%, transparent)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, transparent), color-mix(in srgb, var(--color-surface-2) 92%, transparent))",
  boxShadow:
    "0 14px 30px color-mix(in srgb, black 16%, transparent), inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
};

const subtextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--color-text-muted)",
};

const responsiveOverviewGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 20,
  alignItems: "start",
};

const responsiveWizardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
  gap: 20,
  alignItems: "start",
};

function ChoiceCard({
  icon,
  title,
  description,
  emphasis = false,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  description: string;
  emphasis?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sectionCard,
        padding: "1.1rem",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "grid",
        gap: 14,
        opacity: disabled ? 0.7 : 1,
        border: emphasis
          ? "1px solid color-mix(in srgb, var(--color-primary) 46%, transparent)"
          : sectionCard.border,
        background: emphasis
          ? "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 12%, var(--color-surface)), color-mix(in srgb, var(--color-surface-2) 92%, transparent))"
          : sectionCard.background,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: emphasis ? "var(--color-primary)" : "var(--color-success)",
          background: emphasis
            ? "color-mix(in srgb, var(--color-primary) 16%, transparent)"
            : "color-mix(in srgb, var(--color-success) 16%, transparent)",
        }}
      >
        <AppIcon name={icon} size={18} strokeWidth={2.1} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <p style={subtextStyle}>{description}</p>
      </div>
    </button>
  );
}

function LanguageSwitch({
  value,
  onChange,
}: {
  value: AppLanguage;
  onChange: (next: AppLanguage) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        borderRadius: "var(--radius-full)",
        border:
          "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
        background: "color-mix(in srgb, var(--color-surface) 88%, transparent)",
      }}
    >
      {(["es", "en"] as const).map((lang) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(lang)}
            style={{
              border: "none",
              borderRadius: "var(--radius-full)",
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: active
                ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                : "transparent",
              color: active ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default function Wizard({
  onComplete,
}: {
  onComplete: (options?: { startIndexing?: boolean }) => void;
}) {
  /** 0 = welcome screen; n ≥ 1 = steps[n - 1]. */
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<AppLanguage>("es");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [config, setConfig] = useState<WizardConfig>({
    ftp_host: "",
    ftp_port: 21,
    ftp_user: "",
    ftp_pass: "",
    ftp_root: DEFAULT_FTP_ROOT,
    ftp_tls: false,
    ftp_tls_accept_invalid_certs: false,
    tmdb_api_key: "",
    default_language: "es",
    download_folder: "",
    folder_types: DEFAULT_FOLDER_TYPES_STRING,
    max_concurrent_downloads: 2,
    emby_url: "",
    emby_api_key: "",
    plex_url: "",
    plex_token: "",
    auto_check_updates: false,
    updater_endpoint: "",
    updater_pubkey: "",
  });

  const steps = useMemo<StepDef[]>(
    () => [
      {
        id: "ftp",
        label: t(language, "wizard.stepFtp"),
        description: t(language, "settings.ftpDescription"),
        icon: "folder",
      },
      {
        id: "tmdb",
        label: t(language, "wizard.stepTmdb"),
        description: t(language, "wizard.stepTmdbDesc"),
        icon: "search",
      },
      {
        id: "downloads",
        label: t(language, "settings.downloadsTitle"),
        description: t(language, "wizard.stepDownloadsDesc"),
        icon: "download",
      },
      ...(isTauri()
        ? [
            {
              id: "storage" as const,
              label: t(language, "wizard.stepDataDir"),
              description: t(language, "wizard.dataDirDesc"),
              icon: "database" as const,
            },
          ]
        : []),
      {
        id: "confirm",
        label: t(language, "wizard.stepConfirm"),
        description: t(language, "wizard.confirmDescription"),
        icon: "check",
      },
    ],
    [language],
  );

  const currentStep = step > 0 ? steps[step - 1] : null;
  const goTo = (id: StepId) =>
    setStep(steps.findIndex((s) => s.id === id) + 1);
  const back = () => setStep((current) => Math.max(0, current - 1));

  const next = async (partial: Partial<WizardConfig> = {}) => {
    if (transitioning) return;
    const merged = { ...config, ...partial };

    if (currentStep?.id === "ftp") {
      setTransitioning(true);
      try {
        const dirs = await invoke<string[]>("ftp_list_root_dirs_preview", {
          host: merged.ftp_host,
          port: merged.ftp_port,
          user: merged.ftp_user,
          pass: merged.ftp_pass,
          root: merged.ftp_root,
          tls: merged.ftp_tls,
          tlsAcceptInvalidCerts: merged.ftp_tls_accept_invalid_certs,
        });
        merged.folder_types = mergeInferredFolderTypes(
          merged.folder_types,
          dirs,
        );
      } catch {
        // Leave folder mapping empty if FTP root inference is unavailable.
      } finally {
        setTransitioning(false);
      }
    }

    setConfig(merged);
    setStep((current) => Math.min(steps.length, current + 1));
  };

  const changeLanguage = (lang: AppLanguage) => {
    setLanguage(lang);
    // Until the user picks otherwise in the TMDB step, the library language
    // follows the language they chose for the wizard itself.
    if (!config.tmdb_api_key) {
      setConfig((c) => ({ ...c, default_language: lang }));
    }
  };

  const restoreBackup = async () => {
    setRestoreError("");
    setRestoring(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (typeof selected !== "string") return;
      await invoke("import_library_backup", { sourcePath: selected });
      onComplete({ startIndexing: false });
    } catch (error: unknown) {
      setRestoreError(String(error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem)",
        background:
          "radial-gradient(circle at top, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 42%), var(--color-bg)",
      }}
    >
      <div
        style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gap: 20 }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            padding: "0.25rem 0.25rem 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 15,
                background:
                  "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <BoxTeamMark size={28} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "var(--color-text)",
                }}
              >
                {t(language, "wizard.welcomeTitle")}
              </h1>
              <p style={{ ...subtextStyle, marginTop: 4, maxWidth: 640 }}>
                {currentStep
                  ? `${t(language, "wizard.stepOf")
                      .replace("{n}", String(step))
                      .replace("{total}", String(steps.length))} · ${currentStep.label}`
                  : t(language, "wizard.welcomeDescription")}
              </p>
            </div>
          </div>
          <LanguageSwitch value={language} onChange={changeLanguage} />
        </header>

        {step === 0 || !currentStep ? (
          <div style={responsiveOverviewGrid}>
            <section style={{ ...shellCard, padding: "1.4rem 1.5rem" }}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                      color: "var(--color-text)",
                    }}
                  >
                    {t(language, "wizard.setupOverview")}
                  </h2>
                  <p style={subtextStyle}>
                    {t(language, "wizard.setupOverviewDesc")}
                  </p>
                </div>

                <ol
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {steps
                    .filter((s) => s.id !== "confirm")
                    .map((s, index) => (
                      <li
                        key={s.id}
                        style={{
                          ...sectionCard,
                          boxShadow: "none",
                          padding: "0.85rem 1rem",
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 800,
                            color: "var(--color-primary)",
                            background:
                              "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                          }}
                        >
                          {index + 1}
                        </span>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--color-text)",
                            }}
                          >
                            {s.label}
                          </div>
                          <p style={{ ...subtextStyle, fontSize: 12.5 }}>
                            {s.description}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              </div>
            </section>

            <section style={{ display: "grid", gap: 14 }}>
              <ChoiceCard
                icon="folder"
                emphasis
                title={t(language, "wizard.startFresh")}
                description={t(language, "wizard.startFreshDescription")}
                onClick={() => setStep(1)}
              />
              <ChoiceCard
                icon="download"
                title={
                  restoring
                    ? t(language, "wizard.restoringBackup")
                    : t(language, "wizard.restoreBackup")
                }
                description={t(language, "wizard.restoreHelp")}
                disabled={restoring}
                onClick={restoreBackup}
              />
              {restoreError && (
                <div
                  role="alert"
                  style={{
                    ...sectionCard,
                    padding: "0.95rem 1rem",
                    color: "var(--color-danger)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {restoreError}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div style={responsiveWizardGrid}>
            <nav
              aria-label={t(language, "wizard.progressLabel")}
              style={{ ...shellCard, padding: "0.75rem", alignSelf: "start" }}
            >
              <ol
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: 4,
                }}
              >
                {steps.map((item, index) => {
                  const isActive = index + 1 === step;
                  const isDone = index + 1 < step;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!isDone}
                        aria-current={isActive ? "step" : undefined}
                        onClick={() => setStep(index + 1)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "0.6rem 0.65rem",
                          borderRadius: "var(--radius)",
                          border: "none",
                          textAlign: "left",
                          font: "inherit",
                          cursor: isDone ? "pointer" : "default",
                          background: isActive
                            ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                            : "transparent",
                          opacity: isDone || isActive ? 1 : 0.6,
                        }}
                      >
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            color: isDone
                              ? "var(--color-success)"
                              : isActive
                                ? "var(--color-primary)"
                                : "var(--color-text-muted)",
                            background: isDone
                              ? "color-mix(in srgb, var(--color-success) 14%, transparent)"
                              : isActive
                                ? "color-mix(in srgb, var(--color-primary) 16%, transparent)"
                                : "color-mix(in srgb, var(--color-surface-2) 88%, transparent)",
                          }}
                        >
                          <AppIcon
                            name={isDone ? "check" : item.icon}
                            size={15}
                            strokeWidth={isDone ? 2.6 : 2.1}
                          />
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? 700 : 600,
                            color: "var(--color-text)",
                          }}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <section
              style={{
                ...shellCard,
                overflow: "hidden",
                alignSelf: "start",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  padding: "1.2rem 1.35rem 1rem",
                  borderBottom:
                    "1px solid color-mix(in srgb, var(--color-border) 72%, transparent)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: "var(--color-text)",
                  }}
                >
                  {currentStep.label}
                </h2>
                <p style={{ ...subtextStyle, marginTop: 6 }}>
                  {currentStep.description}
                </p>
              </div>

              <div style={{ padding: "1.25rem 1.35rem 1.35rem" }}>
                {currentStep.id === "ftp" && (
                  <StepFTP
                    defaults={config}
                    language={language}
                    onNext={next}
                    onBack={back}
                    transitioning={transitioning}
                  />
                )}
                {currentStep.id === "tmdb" && (
                  <StepTMDB
                    defaults={config}
                    language={language}
                    onNext={next}
                    onBack={back}
                  />
                )}
                {currentStep.id === "downloads" && (
                  <StepDownloads
                    defaults={config}
                    language={language}
                    onNext={next}
                    onBack={back}
                  />
                )}
                {currentStep.id === "storage" && (
                  <StepDataDir
                    language={language}
                    onNext={() => next()}
                    onBack={back}
                  />
                )}
                {currentStep.id === "confirm" && (
                  <StepConfirm
                    config={config}
                    language={language}
                    onComplete={onComplete}
                    onBack={back}
                    onEdit={(target: ConfirmEditTarget) => goTo(target)}
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
