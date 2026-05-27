import * as si from "simple-icons";
import { PROVIDER_BY_ID, type ProviderEntry } from "../utils/providers";

// Map of provider iconSlug → simple-icons object. simple-icons exports each
// icon as `siNetflix`, `siAppletv`, etc. We cache the lookup so misses also
// don't repeat. The library inherits currentColor in its SVG paths, so the
// logo automatically follows the chip's text color.
type SimpleIcon = { path: string };
const slugToExport = (slug: string): SimpleIcon | undefined => {
  const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
  return (si as unknown as Record<string, SimpleIcon | undefined>)[key];
};

function fallbackGlyph(entry: ProviderEntry): string {
  if (entry.fallback) return entry.fallback;
  const words = entry.name.split(/\s+/);
  if (words.length === 1) return entry.name.slice(0, 2);
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface Props {
  providerId: number;
  size?: number;
}

export default function PlatformLogo({ providerId, size = 14 }: Props) {
  const entry = PROVIDER_BY_ID.get(providerId);
  if (!entry) return null;

  const icon = entry.iconSlug ? slugToExport(entry.iconSlug) : undefined;
  if (icon) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0, display: "inline-block", verticalAlign: "-2px" }}
      >
        <path d={icon.path} fill="currentColor" />
      </svg>
    );
  }

  // Text fallback for providers without a simple-icons entry.
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        fontSize: Math.round(size * 0.62),
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        borderRadius: 3,
        border: "1px solid currentColor",
        color: "inherit",
      }}
    >
      {fallbackGlyph(entry)}
    </span>
  );
}
