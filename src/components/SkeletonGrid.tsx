import { memo } from "react";
import { LoaderCircle } from "lucide-react";

/**
 * Placeholder card grid shown while the initial `get_all_media` fetch is in
 * flight. Mirrors `VirtualMediaGrid` geometry (160px min card, 16px gap,
 * 24px padding) and `MediaCard` shape (2:3 poster + title + meta line) so
 * the layout doesn't shift when real cards arrive.
 *
 * Uses the global `.skeleton` shimmer class from index.css.
 */
interface SkeletonGridProps {
  count?: number;
  /** What the app is doing right now ("Preparando tu biblioteca…"). */
  caption?: string;
  /** Smaller second line under the caption. */
  detail?: string;
}

function SkeletonGrid({ count = 12, caption, detail }: SkeletonGridProps) {
  return (
    <div
      aria-busy="true"
      aria-label={caption ?? "Loading library"}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        padding: "24px 24px 0",
      }}
    >
      {caption && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
            color: "var(--color-text)",
          }}
        >
          <LoaderCircle
            size={18}
            strokeWidth={2.2}
            aria-hidden="true"
            style={{
              color: "var(--color-primary)",
              animation: "spin 1.1s linear infinite",
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 650 }}>{caption}</span>
            {detail && (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {detail}
              </span>
            )}
          </div>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 16,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <div
              className="skeleton"
              style={{
                aspectRatio: "2 / 3",
                borderRadius: "var(--radius-lg)",
              }}
            />
            <div
              className="skeleton"
              style={{ height: 12, width: "78%", borderRadius: 4 }}
            />
            <div
              className="skeleton"
              style={{ height: 10, width: "46%", borderRadius: 4 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(SkeletonGrid);
