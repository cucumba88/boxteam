import { Clock } from "lucide-react";
import type { DownloadItem } from "../hooks/useDownloads";
import { formatEtaShort, formatSpeed, percentOf } from "../lib/progressFormat";

interface DownloadRingProps {
  downloadItem: DownloadItem | undefined;
}

export default function DownloadRing({ downloadItem }: DownloadRingProps) {
  if (!downloadItem) return null;
  const { status, bytes_done, bytes_total, speed_bps } = downloadItem;
  if (status !== "queued" && status !== "downloading") return null;

  const r = 28; // Fixed radius
  const circumference = 2 * Math.PI * r;
  // Same numbers as the Downloads tab: binary units, same ETA wording.
  // Queued → clock instead of a misleading "0%"; downloading without a known
  // size yet → spinning arc, no percent.
  const isQueued = status === "queued";
  const pct = isQueued ? null : percentOf(bytes_done, bytes_total);
  const indeterminate = !isQueued && pct == null;
  const offset = circumference * (1 - (pct ?? (indeterminate ? 25 : 0)) / 100);

  const displaySpeed = status === "downloading" ? formatSpeed(speed_bps) || null : null;
  const displayEta =
    status === "downloading" && pct != null
      ? formatEtaShort(speed_bps, bytes_total - bytes_done) || null
      : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
        background: `radial-gradient(
          ellipse 70% 70% at 50% 50%,
          color-mix(in srgb, black 72%, transparent) 0%,
          color-mix(in srgb, black 52%, transparent) 55%,
          color-mix(in srgb, black 30%, transparent) 100%
        )`,
        backdropFilter: "blur(1px)",
        WebkitBackdropFilter: "blur(1px)",
        zIndex: 3,
        pointerEvents: "none",
        borderRadius: "var(--radius-lg)",
        animation: "dl-fade-in 0.2s ease both",
      }}
    >
      {/* Ring container */}
      <div
        style={{
          position: "relative",
          width: 80,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* SVG ring */}
        <svg
          viewBox="0 0 70 70"
          className={indeterminate ? "ui-spin" : undefined}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            filter:
              "drop-shadow(0 0 5px color-mix(in srgb, var(--color-primary) 60%, transparent))",
          }}
        >
          {/* Track */}
          <circle
            cx={35}
            cy={35}
            r={r}
            fill="none"
            stroke="color-mix(in srgb, white 15%, transparent)"
            strokeWidth={4}
          />
          {/* Progress */}
          <circle
            cx={35}
            cy={35}
            r={r}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={4.5}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
            className={isQueued ? "ring-pulse" : undefined}
          />
        </svg>

        {/* Centre: percent, or a clock while queued */}
        {isQueued ? (
          <Clock
            size={24}
            strokeWidth={2.2}
            color="#fff"
            aria-hidden="true"
            style={{ position: "relative", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.8))" }}
          />
        ) : pct != null ? (
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "baseline",
            gap: 0,
          }}
        >
          <span
            style={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1,
              letterSpacing: "-0.03em",
              textShadow:
                "0 1px 6px color-mix(in srgb, black 90%, transparent)",
            }}
          >
            {pct.toFixed(0)}
          </span>
          <span
            style={{
              fontSize: "0.9rem",
              fontWeight: 700,
              letterSpacing: 0,
              opacity: 0.8,
              color: "#fff",
              textShadow:
                "0 1px 6px color-mix(in srgb, black 90%, transparent)",
            }}
          >
            %
          </span>
        </div>
        ) : null}
      </div>

      {/* Metadata pills (speed & ETA) */}
      {(displaySpeed || displayEta) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
          }}
        >
          {displaySpeed && (
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                color: "color-mix(in srgb, white 90%, transparent)",
                background: "color-mix(in srgb, black 45%, transparent)",
                border: "1px solid color-mix(in srgb, white 12%, transparent)",
                borderRadius: "999px",
                padding: "0.15rem 0.5rem",
                letterSpacing: "0.02em",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              {displaySpeed}
            </span>
          )}
          {displayEta && (
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                color: "color-mix(in srgb, white 65%, transparent)",
                background: "color-mix(in srgb, black 45%, transparent)",
                border: "1px solid color-mix(in srgb, white 12%, transparent)",
                borderRadius: "999px",
                padding: "0.15rem 0.5rem",
                letterSpacing: "0.02em",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              {displayEta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
