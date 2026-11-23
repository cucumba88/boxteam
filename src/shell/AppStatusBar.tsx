import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  Download,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import ActivityIndicator, { type ActivityTask } from "./ActivityIndicator";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { percentOf } from "../lib/progressFormat";

/** How long the green "done" chip stays. Shared with MobileProgressStrip. */
export const COMPLETION_FLASH_MS = 4000;

interface Props {
  language: AppLanguage;
  connection?: {
    state: "ok" | "warn" | "error" | "unknown";
    label: string;
  };
  /**
   * Active indexing state — drives the center "INDEXANDO" segment with a
   * spinner and percent bar. When `isActive` is false the `label` (item
   * count, etc.) is still shown but in a muted style.
   */
  indexing?: {
    label: string;
    /** 0–100, or null while the total isn't known yet (spinner only). */
    percent?: number | null;
    isActive: boolean;
  };
  /**
   * Background metadata-refresh / ratings-refresh progress. Both can run
   * independently of indexing; when present they replace the muted item
   * count so the user sees what's happening without a floating toast.
   */
  metaRefresh?: { label: string; done: number; total: number } | null;
  ratingsRefresh?: { label: string; done: number; total: number } | null;
  watchProvidersRefresh?: { label: string; done: number; total: number } | null;
  /**
   * One-shot completion signal. When this changes from null → a value, the
   * status bar flashes a brief green success state instead of popping a
   * floating toast. The component clears itself after a few seconds.
   */
  completionFlash?: { label: string; sublabel?: string } | null;
  onCompletionFlashClear?: () => void;
  transfers?: {
    downloads: number;
    uploads: number;
  };
  onShowActivity?: () => void;
  activityCount?: number;
  onJumpToDownloads?: () => void;
  onJumpToUploads?: () => void;
}

const DOT_COLORS: Record<"ok" | "warn" | "error" | "unknown", string> = {
  ok: "var(--color-success)",
  warn: "var(--color-warning)",
  error: "var(--color-danger)",
  unknown: "var(--color-text-muted)",
};

export default function AppStatusBar({
  language,
  connection,
  indexing,
  metaRefresh,
  ratingsRefresh,
  watchProvidersRefresh,
  completionFlash,
  onCompletionFlashClear,
  transfers,
  onShowActivity,
  activityCount,
  onJumpToDownloads,
  onJumpToUploads,
}: Props) {
  // Completion flash auto-clears after 4s — long enough to be noticed, short
  // enough to not feel persistent. Mirrors what the old floating toast did
  // (8s auto-dismiss) but inline so it never covers content.
  const [flashVisible, setFlashVisible] = useState(false);
  // Keep the latest callback in a ref: an inline `() => …` prop changes on
  // every parent render and would otherwise restart the timer forever.
  const onClearRef = useRef(onCompletionFlashClear);
  onClearRef.current = onCompletionFlashClear;
  useEffect(() => {
    if (!completionFlash) {
      setFlashVisible(false);
      return;
    }
    setFlashVisible(true);
    const timer = window.setTimeout(() => {
      setFlashVisible(false);
      onClearRef.current?.();
    }, COMPLETION_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [completionFlash]);

  // Live work always takes priority over the completion flash — a user who
  // kicked off "refresh metadata" right after an index run needs to see the
  // new progress immediately, not the stale "done" chip. Cancel the flash
  // the moment any new background job is observed running.
  const liveWorkActive =
    !!(
      indexing?.isActive ||
      (metaRefresh && metaRefresh.total > 0) ||
      (ratingsRefresh && ratingsRefresh.total > 0) ||
      (watchProvidersRefresh && watchProvidersRefresh.total > 0)
    );
  useEffect(() => {
    if (liveWorkActive && flashVisible) {
      setFlashVisible(false);
      onClearRef.current?.();
    }
  }, [liveWorkActive, flashVisible]);

  // Every job that is running right now, in a stable order. The status bar
  // only shows a compact chip for them; the full list (with a bar each)
  // lives in a popover so the bar never grows or shimmers.
  const tasks: ActivityTask[] = [];
  if (indexing?.isActive) {
    tasks.push({
      id: "indexing",
      label: indexing.label,
      percent: indexing.percent ?? null,
    });
  }
  for (const [id, job] of [
    ["meta", metaRefresh],
    ["ratings", ratingsRefresh],
    ["providers", watchProvidersRefresh],
  ] as const) {
    if (job && job.total > 0) {
      tasks.push({
        id,
        label: job.label,
        percent: percentOf(job.done, job.total) ?? 0,
      });
    }
  }

  const renderCenter = () => {
    if (tasks.length > 0) {
      return <ActivityIndicator language={language} tasks={tasks} />;
    }
    if (flashVisible && completionFlash) {
      return (
        <span
          className="shell-statusbar-flash"
          role="status"
          aria-live="polite"
        >
          <Check size={12} strokeWidth={2.8} aria-hidden="true" />
          <span style={{ fontWeight: 700 }}>{completionFlash.label}</span>
          {completionFlash.sublabel && (
            <span style={{ opacity: 0.9 }}>· {completionFlash.sublabel}</span>
          )}
        </span>
      );
    }
    return <span style={{ opacity: 0.6 }}>{indexing?.label ?? ""}</span>;
  };

  return (
    <footer className="shell-statusbar">
      {/* Left: connection */}
      <div className="shell-statusbar-section">
        {connection ? (
          <>
            <span
              className="shell-statusbar-dot"
              style={{ background: DOT_COLORS[connection.state] }}
              aria-hidden="true"
            />
            {connection.state === "error" ? (
              <WifiOff size={12} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Wifi size={12} strokeWidth={2.2} aria-hidden="true" />
            )}
            <span>{connection.label}</span>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </div>

      {/* Center: indexing / refresh / completion-flash */}
      <div className="shell-statusbar-section center">{renderCenter()}</div>

      {/* Right: transfers + activity */}
      <div className="shell-statusbar-section">
        {transfers && transfers.downloads > 0 && (
          <button
            type="button"
            className="shell-statusbar-btn"
            onClick={onJumpToDownloads}
            title={t(language, "statusbar.activeDownloads")}
            aria-label={`${t(language, "statusbar.activeDownloads")}: ${transfers.downloads}`}
          >
            <Download size={12} strokeWidth={2.2} aria-hidden="true" />
            <span>{transfers.downloads}</span>
          </button>
        )}
        {transfers && transfers.uploads > 0 && (
          <button
            type="button"
            className="shell-statusbar-btn"
            onClick={onJumpToUploads}
            title={t(language, "statusbar.activeUploads")}
            aria-label={`${t(language, "statusbar.activeUploads")}: ${transfers.uploads}`}
          >
            <Upload size={12} strokeWidth={2.2} aria-hidden="true" />
            <span>{transfers.uploads}</span>
          </button>
        )}
        {onShowActivity && (
          <button
            type="button"
            className="shell-statusbar-btn"
            onClick={onShowActivity}
            title={t(language, "statusbar.activityLog")}
            aria-label={t(language, "statusbar.activityLog")}
          >
            <Activity size={12} strokeWidth={2.2} aria-hidden="true" />
            {activityCount !== undefined && activityCount > 0 && (
              <span>{activityCount}</span>
            )}
          </button>
        )}
      </div>
    </footer>
  );
}
