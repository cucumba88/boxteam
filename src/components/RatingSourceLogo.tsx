import type { RatingSource } from "../lib/ratingSource";
import imdbLogo from "../assets/brand/imdb.svg";
import tmdbLogo from "../assets/brand/tmdb.svg";

/**
 * Official brand logos for the two rating sources. The SVG files are the
 * canonical brand assets:
 *
 *   - imdb.svg  → IMDb "2016" wordmark on yellow pill, from Wikimedia
 *                  Commons (the file IMDb uses on their own site).
 *   - tmdb.svg  → TheMovieDB "stacked short" logo, downloaded verbatim
 *                  from themoviedb.org/assets/2/v4/logos/v2/blue_square_1.svg.
 *
 * They're shipped as files under `src/assets/brand/` and imported as URL
 * strings via Vite's static-asset pipeline, so what we render is byte-for-
 * byte what the brand owners publish — no path tracing or approximations.
 *
 * `height` is the rendered height in px; the browser scales width by each
 * SVG's intrinsic aspect ratio. Defaults to 16 px.
 */

interface Props {
  source: RatingSource;
  height?: number;
  title?: string;
}

const LOGO: Record<RatingSource, string> = {
  imdb: imdbLogo,
  tmdb: tmdbLogo,
};

const FULL_NAME: Record<RatingSource, string> = {
  imdb: "IMDb",
  tmdb: "The Movie Database",
};

export default function RatingSourceLogo({ source, height = 16, title }: Props) {
  return (
    <img
      src={LOGO[source]}
      alt={title ?? FULL_NAME[source]}
      height={height}
      style={{
        height,
        width: "auto",
        display: "inline-block",
        verticalAlign: "-3px",
        flexShrink: 0,
        // Prevent the browser from anti-aliasing the small wordmark into
        // mush — let the SVG vector decide pixel coverage.
        imageRendering: "auto",
      }}
    />
  );
}
