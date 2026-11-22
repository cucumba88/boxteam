import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { percentOf } from "../lib/progressFormat";
import { COMPLETION_FLASH_MS } from "../shell/AppStatusBar";

/**
 * Compact progress feedback for the mobile shell. The desktop AppStatusBar
 * is `display: none` on ≤767px, so the same signals (indexing /
 * metaRefresh / ratingsRefresh / completion flash) need a mobile-native
 * surface — this component is that surface.
 *
 * Renders as a sticky strip directly below the mobile top navbar:
 *   • Idle → nothing (height 0)
 *   • Working → 32px row: spinner + label + percent + thin progress bar
 *   • Completion → brief green confirmation row (same duration as desktop)
 *
 * Visual language matches the desktop status bar (same accent strip,
 * brand-purple progress, success green for completion) so the experience
 * stays coherent across surfaces.
 */

interface Props {
  indexing?: {
    label: string;
    percent?: number | null;
    isActive: boolean;
  };
  metaRefresh?: { label: string; done: number; total: number } | null;
  ratingsRefresh?: { label: string; done: number; total: number } | null;
  watchProvidersRefresh?: { label: string; done: number; total: number } | null;
  completionFlash?: { label: string; sublabel?: string } | null;
  onCompletionFlashClear?: () => void;
}

export default function MobileProgressStrip({
  indexing,
  metaRefresh,
  ratingsRefresh,
  watchProvidersRefresh,
  completionFlash,
  onCompletionFlashClear,
}: Props) {
  const [flashVisible, setFlashVisible] = useState(false);
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

  const liveWorkActive = !!(
    indexing?.isActive ||
    (metaRefresh && metaRefresh.total > 0) ||
    (ratingsRefresh && ratingsRefresh.total > 0) ||
    (watchProvidersRefresh && watchProvidersRefresh.total > 0)
  );

  // Live work always wins over the flash — same rule as the desktop bar.
  useEffect(() => {
    if (liveWorkActive && flashVisible) {
      setFlashVisible(false);
      onClearRef.current?.();
    }
  }, [liveWorkActive, flashVisible]);

  const visible = liveWorkActive || flashVisible;
  if (!visible) return null;

  // Priority: indexing → meta → ratings → flash (only when nothing live)
  let label = "";
  let pct: number | null = null;

  if (indexing?.isActive) {
    label = indexing.label;
    pct = indexing.percent ?? null;
  } else if (metaRefresh && metaRefresh.total > 0) {
    label = metaRefresh.label;
    pct = percentOf(metaRefresh.done, metaRefresh.total);
  } else if (ratingsRefresh && ratingsRefresh.total > 0) {
    label = ratingsRefresh.label;
    pct = percentOf(ratingsRefresh.done, ratingsRefresh.total);
  } else if (watchProvidersRefresh && watchProvidersRefresh.total > 0) {
    label = watchProvidersRefresh.label;
    pct = percentOf(watchProvidersRefresh.done, watchProvidersRefresh.total);
  }

  const isFlash = !liveWorkActive && flashVisible && completionFlash;
  const accent = isFlash ? "var(--color-success)" : "var(--color-primary)";

  return (
    <div
      className={`mobile-progress-strip${isFlash ? " flashing" : " working"}`}
      role="status"
      aria-live="polite"
      style={
        {
          // Each <span> child clamps its width so long labels don't push
          // the percent off-screen on narrow viewports.
          "--mobile-strip-accent": accent,
        } as React.CSSProperties
      }
    >
      <div className="mobile-progress-strip-row">
        {isFlash ? (
          <>
            <span className="mobile-progress-strip-icon" aria-hidden="true">
              <Check size={13} strokeWidth={2.8} />
            </span>
            <span className="mobile-progress-strip-label">
              <strong>{completionFlash!.label}</strong>
              {completionFlash!.sublabel && (
                <span style={{ opacity: 0.85 }}>
                  {" · "}
                  {completionFlash!.sublabel}
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="mobile-progress-strip-icon" aria-hidden="true">
              <RefreshCw
                size={13}
                strokeWidth={2.4}
                className="mobile-progress-strip-spinner"
              />
            </span>
            <span className="mobile-progress-strip-label">{label}</span>
            {pct !== null && (
              <span className="mobile-progress-strip-percent">{pct}%</span>
            )}
          </>
        )}
      </div>
      {/* Bottom-edge bar: solid % when known, shimmer when indeterminate */}
      {!isFlash && (
        <div className="mobile-progress-strip-bar">
          {pct !== null ? (
            <div
              className="mobile-progress-strip-bar-fill"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="mobile-progress-strip-bar-shimmer" />
          )}
        </div>
      )}
      {isFlash && <div className="mobile-progress-strip-bar flash" />}
    </div>
  );
}
