import { Activity, Download, RefreshCw, Upload, Wifi, WifiOff } from "lucide-react";

interface Props {
  connection?: {
    state: "ok" | "warn" | "error" | "unknown";
    label: string;
  };
  indexing?: {
    label: string;
    progress?: { current: number; total: number } | null;
    isActive: boolean;
  };
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
  transfers,
  onShowActivity,
  activityCount,
  onJumpToDownloads,
  onJumpToUploads,
}: Props) {
  const showProgress =
    indexing?.isActive &&
    indexing?.progress &&
    indexing.progress.total > 0;
  const percent = showProgress
    ? Math.min(
        100,
        Math.round((indexing!.progress!.current / indexing!.progress!.total) * 100),
      )
    : 0;

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

      {/* Center: indexing */}
      <div className="shell-statusbar-section center">
        {indexing?.isActive ? (
          <>
            <RefreshCw
              size={12}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{ animation: "spin 1.6s linear infinite" }}
            />
            <span>{indexing.label}</span>
            {showProgress && (
              <div
                className="shell-statusbar-progress"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div style={{ width: `${percent}%` }} />
              </div>
            )}
          </>
        ) : (
          <span style={{ opacity: 0.6 }}>{indexing?.label ?? ""}</span>
        )}
      </div>

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
