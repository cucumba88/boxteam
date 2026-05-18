import { useState } from "react";
import { ALPHA_LETTERS } from "../utils/alphaJump";
import { t } from "../utils/i18n";
import type { AppLanguage } from "../utils/mediaLanguage";

export interface AlphaJumpRailProps {
  alphaIndex: Record<string, number | null>;
  onJump: (letter: string) => void;
  language: AppLanguage;
  /** Letter currently at the top of the visible grid — gets highlighted. */
  activeLetter?: string | null;
}

export default function AlphaJumpRail({
  alphaIndex,
  onJump,
  language,
  activeLetter,
}: AlphaJumpRailProps) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div
      role="navigation"
      aria-label={t(language, "nav.alphaJump")}
      style={{
        position: "absolute",
        right: 6,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding: "8px 4px",
        borderRadius: 14,
        // Opaque-ish background, no backdrop-filter — over a scrolling
        // grid on iOS Safari, the blur recomputes every paint frame and
        // tanks scroll perf.
        background:
          "color-mix(in srgb, var(--color-surface) 96%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
        boxShadow:
          "0 6px 18px color-mix(in srgb, black 18%, transparent)",
        zIndex: 5,
        userSelect: "none",
        pointerEvents: "auto",
      }}
      onMouseLeave={() => setHover(null)}
    >
      {ALPHA_LETTERS.map((letter) => {
        const enabled = alphaIndex[letter] != null;
        const isHover = hover === letter;
        const isActive = enabled && activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            disabled={!enabled}
            onMouseEnter={() => enabled && setHover(letter)}
            onFocus={() => enabled && setHover(letter)}
            onClick={() => enabled && onJump(letter)}
            aria-label={`${t(language, "nav.alphaJump")}: ${letter}`}
            aria-current={isActive ? "true" : undefined}
            style={{
              width: 20,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: isActive
                ? "color-mix(in srgb, var(--color-primary) 22%, transparent)"
                : "transparent",
              borderRadius: 4,
              padding: 0,
              fontSize: 10.5,
              lineHeight: 1,
              fontWeight: isActive ? 800 : 700,
              fontFamily: "inherit",
              letterSpacing: 0,
              color: enabled
                ? isActive || isHover
                  ? "var(--color-primary)"
                  : "var(--color-text-muted)"
                : "color-mix(in srgb, var(--color-text-muted) 45%, transparent)",
              opacity: enabled ? 1 : 0.45,
              cursor: enabled ? "pointer" : "default",
              pointerEvents: enabled ? "auto" : "none",
              transition:
                "color 0.1s ease, background 0.1s ease, font-weight 0.1s ease",
            }}
          >
            {letter}
          </button>
        );
      })}
      {hover && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: "100%",
            top: "50%",
            transform: "translate(-12px, -50%)",
            minWidth: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            background:
              "color-mix(in srgb, var(--color-primary) 90%, transparent)",
            color: "white",
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 0,
            boxShadow:
              "0 10px 26px color-mix(in srgb, black 30%, transparent)",
            pointerEvents: "none",
          }}
        >
          {hover}
        </div>
      )}
    </div>
  );
}
