import { useState } from "react";
import { Clapperboard, ImageDown, RotateCcw, type LucideIcon } from "lucide-react";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ConfirmDialog";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import {
  useLibraryMaintenance,
  type MaintenanceStatus,
  type MaintenanceTask,
} from "./useLibraryMaintenance";

interface RowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  status: MaintenanceStatus;
  disabled: boolean;
  language: AppLanguage;
  onClick: () => void;
}

function MaintenanceRow({
  icon,
  title,
  description,
  buttonLabel,
  status,
  disabled,
  language,
  onClick,
}: RowProps) {
  const running = status.state === "running";
  const feedback =
    status.state === "done"
      ? t(language, "maintenance.done")
      : status.state === "started"
        ? t(language, "maintenance.started")
        : status.state === "error"
          ? status.message
          : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "12px 0",
        borderTop:
          "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
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
        {feedback && (
          <div
            role="status"
            style={{
              fontSize: 12,
              marginTop: 4,
              color:
                status.state === "error"
                  ? "var(--color-danger)"
                  : "var(--color-success)",
            }}
          >
            {feedback}
          </div>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon={icon}
        disabled={disabled}
        aria-busy={running}
        onClick={onClick}
      >
        {running ? t(language, "maintenance.running") : buttonLabel}
      </Button>
    </div>
  );
}

/**
 * "Mantenimiento de la biblioteca" in Settings: manual triggers for jobs
 * that otherwise run on their own (startup + every 15 min), plus the full
 * re-match, which asks for confirmation because it overwrites data.
 */
export default function LibraryMaintenance({ language }: { language: AppLanguage }) {
  const { status, run, anyRunning } = useLibraryMaintenance();
  const [confirmRematch, setConfirmRematch] = useState(false);

  const row = (
    task: MaintenanceTask,
    icon: LucideIcon,
    key: "metadata" | "providers" | "rematch",
    onClick: () => void,
    buttonLabel = t(language, "maintenance.run"),
  ) => (
    <MaintenanceRow
      icon={icon}
      title={t(language, `maintenance.${key}Title`)}
      description={t(language, `maintenance.${key}Description`)}
      buttonLabel={buttonLabel}
      status={status[task]}
      disabled={anyRunning}
      language={language}
      onClick={onClick}
    />
  );

  return (
    <div>
      {row("metadata", ImageDown, "metadata", () => run("metadata"))}
      {row("providers", Clapperboard, "providers", () => run("providers"))}
      {row(
        "rematch",
        RotateCcw,
        "rematch",
        () => setConfirmRematch(true),
        t(language, "maintenance.rematchButton"),
      )}
      <ConfirmDialog
        open={confirmRematch}
        title={t(language, "maintenance.rematchConfirmTitle")}
        description={t(language, "maintenance.rematchConfirmDescription")}
        removes={[t(language, "maintenance.removesAutoMatches")]}
        keeps={[
          t(language, "reset.keepsManualMatches"),
          t(language, "reset.keepsIndex"),
        ]}
        confirmLabel={t(language, "maintenance.rematchButton")}
        cancelLabel={t(language, "common.cancel")}
        onConfirm={() => {
          setConfirmRematch(false);
          void run("rematch");
        }}
        onCancel={() => setConfirmRematch(false)}
      />
    </div>
  );
}
