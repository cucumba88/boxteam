import type { ReactNode } from "react";
import AppIcon from "../AppIcon";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";

/** Shared look for the first-run wizard steps. */
export const wizardSectionCard: React.CSSProperties = {
  borderRadius: "var(--radius-lg)",
  border: "1px solid color-mix(in srgb, var(--color-border) 76%, transparent)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, transparent), color-mix(in srgb, var(--color-surface-2) 92%, transparent))",
  boxShadow:
    "0 14px 30px color-mix(in srgb, black 16%, transparent), inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
  padding: "1rem",
};

export const wizardField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export const wizardLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
};

export const wizardInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.72rem 0.9rem",
  borderRadius: "var(--radius)",
  border: "1px solid color-mix(in srgb, var(--color-border) 78%, transparent)",
  background: "color-mix(in srgb, var(--color-surface-2) 84%, transparent)",
  color: "var(--color-text)",
  fontSize: 14,
  outline: "none",
  boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
};

export const wizardSubtext: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--color-text-muted)",
};

export const wizardGhostBtn = (disabled?: boolean): React.CSSProperties => ({
  padding: "9px 14px",
  borderRadius: "var(--radius-full)",
  border: "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
  background: "color-mix(in srgb, var(--color-surface) 88%, transparent)",
  color: "var(--color-text-muted)",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  opacity: disabled ? 0.7 : 1,
});

const filledBtn = (
  color: string,
  disabled?: boolean,
): React.CSSProperties => ({
  ...wizardGhostBtn(disabled),
  border: "none",
  background: disabled
    ? `color-mix(in srgb, ${color} 46%, transparent)`
    : color,
  color: "#fff",
  opacity: 1,
});

/** Inline status pill ("Conectado", "La key es válida"…). */
export function WizardStatusPill({
  tone,
  children,
}: {
  tone: "success" | "danger";
  children: ReactNode;
}) {
  const color = tone === "success" ? "var(--color-success)" : "var(--color-danger)";
  return (
    <span
      role="status"
      style={{
        ...wizardGhostBtn(true),
        cursor: "default",
        opacity: 1,
        border: "none",
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
      }}
    >
      <AppIcon
        name={tone === "success" ? "check" : "close"}
        size={14}
        strokeWidth={2.5}
      />
      {children}
    </span>
  );
}

/**
 * Footer shared by every wizard step: "Anterior" on the left (next to any
 * step-specific actions like "Probar conexión"), the primary action on the
 * right. Keeping both navigation buttons in the same row avoids hunting for
 * "Anterior" at the top of the page.
 */
export function WizardFooter({
  language,
  onBack,
  extra,
  nextLabel,
  nextDisabled = false,
  nextBusy = false,
  nextTone = "primary",
  nextType = "button",
  onNext,
}: {
  language: AppLanguage;
  onBack?: () => void;
  extra?: ReactNode;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextBusy?: boolean;
  nextTone?: "primary" | "success";
  nextType?: "button" | "submit";
  onNext?: () => void;
}) {
  const color =
    nextTone === "success" ? "var(--color-success)" : "var(--color-primary)";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          flex: "1 1 0",
          minWidth: 0,
        }}
      >
        {onBack && (
          <button type="button" style={wizardGhostBtn()} onClick={onBack}>
            <AppIcon name="chevron-left" size={14} strokeWidth={2.2} />
            {t(language, "library.prev")}
          </button>
        )}
        {extra}
      </div>
      <button
        type={nextType}
        style={filledBtn(color, nextDisabled || nextBusy)}
        disabled={nextDisabled || nextBusy}
        onClick={onNext}
      >
        {nextBusy && (
          <AppIcon name="refresh-cw" size={14} strokeWidth={2.2} />
        )}
        {nextLabel ?? t(language, "library.next")}
        {!nextBusy && nextTone === "primary" && (
          <AppIcon name="chevron-right" size={14} strokeWidth={2.2} />
        )}
        {!nextBusy && nextTone === "success" && (
          <AppIcon name="check" size={14} strokeWidth={2.4} />
        )}
      </button>
    </div>
  );
}

/**
 * Translate the raw FTP error string from the backend into a friendly,
 * Spanish-first sentence. The raw text is still shown as a detail line.
 */
export function friendlyFtpError(language: AppLanguage, raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("refused")) return t(language, "wizard.ftpErrorRefused");
  if (s.includes("timed out") || s.includes("timeout"))
    return t(language, "wizard.ftpErrorTimeout");
  if (
    s.includes("failed to lookup") ||
    s.includes("name or service not known") ||
    s.includes("no such host") ||
    s.includes("nodename nor servname")
  )
    return t(language, "wizard.ftpErrorHost");
  if (s.includes("530") || s.includes("login") || s.includes("password"))
    return t(language, "wizard.ftpErrorAuth");
  if (s.includes("tls") || s.includes("certificate") || s.includes("ssl"))
    return t(language, "wizard.ftpErrorTls");
  return t(language, "wizard.failedCredentials");
}
