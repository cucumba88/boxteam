import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  Download,
  RefreshCw,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";

type ProgressLike = { current: number; total: number } | null | undefined;

interface Props {
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
    progress?: ProgressLike;
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
  useEffect(() => {
    if (!completionFlash) {
      setFlashVisible(false);
      return;
    }
    setFlashVisible(true);
    const t = window.setTimeout(() => {
      setFlashVisible(false);
      onCompletionFlashClear?.();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [completionFlash, onCompletionFlashClear]);

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
      onCompletionFlashClear?.();
    }
  }, [liveWorkActive, flashVisible, onCompletionFlashClear]);

  // Priority for the center slot, top to bottom:
  //   1. Completion flash (transient win)
  //   2. Active indexing (with percent bar)
  //   3. Metadata refresh (post-index)
  //   4. Ratings refresh (manual)
  //   5. Item-count idle label
  const indexingActive =
    indexing?.isActive &&
    indexing?.progress &&
    indexing.progress.total > 0;
  const indexingPercent = indexingActive
    ? Math.min(
        100,
        Math.round(
          (indexing!.progress!.current / indexing!.progress!.total) * 100,
        ),
      )
    : 0;

  // Shared renderer for a progress slot — keeps the visual signature
  // consistent across indexing / meta-refresh / ratings-refresh so the bar
  // always reads the same way: spinner · label · big bar · percent.
  const renderProgress = (label: string, pct: number) => (
    <>
      <RefreshCw
        size={13}
        strokeWidth={2.4}
        aria-hidden="true"
        className="shell-statusbar-icon-spin"
      />
      <span className="shell-statusbar-label">{label}</span>
      <div
        className="shell-statusbar-progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="shell-statusbar-percent">{pct}%</span>
    </>
  );

  const renderCenter = () => {
    // Priority order, top wins:
    //   1. Active indexing (with bar + percent, or indeterminate spinner)
    //   2. Active metadata refresh
    //   3. Active ratings refresh
    //   4. Completion flash (transient "done" pill — only shown when no
    //      live work is in progress, so doing > done)
    //   5. Idle item count
    if (indexing?.isActive) {
      // Indexing has an indeterminate phase (scanning, no percent yet);
      // show the spinner + label, and add the bar only once we have one.
      if (indexingActive) {
        return renderProgress(indexing.label, indexingPercent);
      }
      return (
        <>
          <RefreshCw
            size={13}
            strokeWidth={2.4}
            aria-hidden="true"
            className="shell-statusbar-icon-spin"
          />
          <span className="shell-statusbar-label">{indexing.label}</span>
        </>
      );
    }
    if (metaRefresh && metaRefresh.total > 0) {
      const pct = Math.min(
        100,
        Math.round((metaRefresh.done / metaRefresh.total) * 100),
      );
      return renderProgress(metaRefresh.label, pct);
    }
    if (ratingsRefresh && ratingsRefresh.total > 0) {
      const pct = Math.min(
        100,
        Math.round((ratingsRefresh.done / ratingsRefresh.total) * 100),
      );
      return renderProgress(ratingsRefresh.label, pct);
    }
    if (watchProvidersRefresh && watchProvidersRefresh.total > 0) {
      const pct = Math.min(
        100,
        Math.round(
          (watchProvidersRefresh.done / watchProvidersRefresh.total) * 100,
        ),
      );
      return renderProgress(watchProvidersRefresh.label, pct);
    }
    if (flashVisible && completionFlash) {
      return (
        <span
          className="shell-statusbar-flash"
          role="status"
          aria-live="polite"
        >
          <Check size={14} strokeWidth={2.8} aria-hidden="true" />
          <span style={{ fontWeight: 800 }}>{completionFlash.label}</span>
          {completionFlash.sublabel && (
            <span style={{ opacity: 0.9 }}>· {completionFlash.sublabel}</span>
          )}
        </span>
      );
    }
    return <span style={{ opacity: 0.6 }}>{indexing?.label ?? ""}</span>;
  };

  // Drive the "working" state on the footer so CSS can grow the bar height,
  // raise font sizes, and show the accent strip without prop-drilling.
  // `liveWorkActive` is recomputed each render — checks every job source so
  // the bar grows the moment any one of them becomes truthy.
  const isWorking = liveWorkActive || flashVisible;

  return (
    <footer
      className={`shell-statusbar${isWorking ? " working" : ""}${
        flashVisible ? " flashing" : ""
      }`}
    >
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
            title="Active downloads"
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
            title="Active uploads"
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
            title="Activity log"
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
