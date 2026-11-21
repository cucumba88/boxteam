import {
  siAppletv,
  siCrunchyroll,
  siHbomax,
  siMax,
  siMovistar,
  siNetflix,
  siParamountplus,
  siRakuten,
  siShowtime,
  siYoutube,
} from "simple-icons";
import { PROVIDER_BY_ID, type ProviderEntry } from "../utils/providers";

// Explicit named imports keep the bundle small: a namespace import
// (`import * as si`) plus a dynamic key lookup defeats tree-shaking and
// pulled all ~3,400 simple-icons (several MB) into the main chunk.
// When adding a provider with a new `iconSlug` in utils/providers.ts, add its
// icon here too. The SVG paths inherit currentColor, so the logo follows the
// chip's text color.
type SimpleIcon = { path: string };
const ICONS: Record<string, SimpleIcon> = {
  appletv: siAppletv,
  crunchyroll: siCrunchyroll,
  hbomax: siHbomax,
  max: siMax,
  movistar: siMovistar,
  netflix: siNetflix,
  paramountplus: siParamountplus,
  rakuten: siRakuten,
  showtime: siShowtime,
  youtube: siYoutube,
};
const slugToExport = (slug: string): SimpleIcon | undefined => ICONS[slug];

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
