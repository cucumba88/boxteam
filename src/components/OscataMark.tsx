import { useId, useState, useEffect } from "react";

/**
 * Inline SVG of the Oscata brand mark — the notched ring used in the sidebar
 * wordmark and the mobile header. Mirrors `src/assets/brand/oscata-mark.svg`
 * but exposes the ring as a real `<path>` so we can animate stroke properties.
 *
 * Two design constraints:
 *
 * 1. **Unique gradient id per instance.** Multiple `<OscataMark>` can mount on
 *    the same page (e.g. the desktop sidebar is `display:none` on mobile but
 *    still rendered, so its OscataMark coexists with the mobile header's).
 *    Sharing a hard-coded `<linearGradient id="…">` causes one or both rings
 *    to fail to render their fill in some browsers (id collision is undefined
 *    behavior in SVG). `useId()` gives each instance its own deterministic id.
 *
 * 2. **Default to fully drawn.** The entrance animation animates
 *    `stroke-dashoffset` from 2000 → 0. If we set the dasharray inline the
 *    ring starts invisible, and any failure to run the CSS animation (some
 *    HMR scenarios, prefers-reduced-motion, paused tabs) leaves the user
 *    staring at a blank space. Instead we mount with the path fully drawn
 *    and toggle a `data-animate-in` attribute on the next paint — if the
 *    animation runs, you get the draw-in; if it doesn't, you still see the
 *    logo.
 *
 * During indexing the same draw gesture loops continuously, driven by
 * `body[data-oscata-indexing="true"]` — see shell.css.
 */
export default function OscataMark({ size = 22 }: { size?: number }) {
  const gradientId = `oscata-mark-ring-${useId()}`;

  // Trigger the entrance animation only after the component has mounted —
  // ensures the ring is always visible by default and only animates in on
  // first paint, never on every HMR refresh of an already-mounted instance.
  const [animateIn, setAnimateIn] = useState(false);
  useEffect(() => {
    // Two RAFs: first commits the data-attribute-less initial paint, second
    // applies the attribute so the browser sees a CSS transition / animation
    // trigger (changes need to be in separate frames to be animated).
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(r2);
    });
    return () => cancelAnimationFrame(r1);
  }, []);

  return (
    <svg
      className="oscata-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role="img"
      aria-label="Oscata"
      data-animate-in={animateIn ? "true" : "false"}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="200"
          y1="200"
          x2="824"
          y2="824"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c4baff" />
          <stop offset="0.45" stopColor="#7c6ef7" />
          <stop offset="1" stopColor="#4a3fd4" />
        </linearGradient>
      </defs>

      <path
        className="oscata-mark-ring"
        d="M 606 185 A 340 340 0 1 0 748 267"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="116"
        strokeLinecap="round"
        pathLength="2000"
      />
    </svg>
  );
}
