import { memo } from "react";

/**
 * Placeholder card grid shown while the initial `get_all_media` fetch is in
 * flight. Mirrors `VirtualMediaGrid` geometry (160px min card, 16px gap,
 * 24px padding) and `MediaCard` shape (2:3 poster + title + meta line) so
 * the layout doesn't shift when real cards arrive.
 *
 * Uses the global `.skeleton` shimmer class from index.css.
 */
function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading library"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        padding: "24px 24px 0",
      }}
    >
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
