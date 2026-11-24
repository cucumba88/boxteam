import { isTauri } from "../lib/transport";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";

/** Wiki page that walks users through getting their TMDB and OMDb keys. */
export const API_KEYS_GUIDE_URL =
  "https://github.com/cucumba88/boxteam/wiki/Claves-de-TMDB-y-OMDb";

/** Open a URL in the system browser (a plain <a target=_blank> does nothing
 *  inside the Tauri webview). */
export function openExternal(url: string) {
  if (isTauri()) {
    import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch((e) => console.error("[openUrl] failed", url, e));
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Inline "step-by-step guide" link shown next to the API key fields. */
export default function ApiKeysGuideLink({
  language,
}: {
  language: AppLanguage;
}) {
  return (
    <button
      type="button"
      onClick={() => openExternal(API_KEYS_GUIDE_URL)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "var(--color-primary)",
        fontWeight: 600,
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >
      {t(language, "settings.apiKeysGuide")}
    </button>
  );
}
