/**
 * Pure formatting helpers shared by every progress surface (status bar,
 * mobile strip, download rings, transfer rows, toasts). Keeping them in one
 * dependency-free module means the numbers read the same everywhere and can
 * be unit-tested with `node --test` (see scripts/progress-format.test.mjs).
 */
import type { AppLanguage } from "../utils/mediaLanguage.ts";
import { t } from "../utils/i18n.ts";

/** "3.726" in Spanish, "3,726" in English. Done by hand because es-ES's
 *  Intl rules skip grouping for 4-digit numbers ("3726"). */
export function formatCount(n: number, language: AppLanguage): string {
  const digits = String(Math.max(0, Math.round(n)));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, language === "es" ? "." : ",");
}

/** Whole-number percent clamped to 0–100. Returns null when total is unknown. */
export function percentOf(done: number, total: number): number | null {
  if (!(total > 0) || !Number.isFinite(done)) return null;
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}

/** Transfer speed, binary units to match formatBytes ("12.4 MB/s"). */
export function formatSpeed(bps?: number | null): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return "";
  if (bps >= 1024 ** 3) return `${(bps / 1024 ** 3).toFixed(2)} GB/s`;
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

/** Compact time-left: "45 s", "12 min", "1 h 05 min". Empty when unknown. */
export function formatEtaShort(
  bps: number | undefined | null,
  remainingBytes: number,
): string {
  if (!bps || !Number.isFinite(bps) || bps <= 0 || remainingBytes <= 0) return "";
  const secs = Math.ceil(remainingBytes / bps);
  if (secs < 60) return `${secs} s`;
  const totalMin = Math.ceil(secs / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 100) return "> 99 h";
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** "12 min restantes" / "12 min left". */
export function formatEta(
  language: AppLanguage,
  bps: number | undefined | null,
  remainingBytes: number,
): string {
  const short = formatEtaShort(bps, remainingBytes);
  return short ? `${short} ${t(language, "transfers.left")}` : "";
}

// ─── Library indexing ────────────────────────────────────────────────────────

export type Counter = { done: number; total: number };

export interface IndexingView {
  label: string;
  /** null → indeterminate (spinner + shimmer, no percent). */
  percent: number | null;
}

/**
 * One label + percent for the whole indexing run, used by both the desktop
 * status bar and the mobile strip:
 *   1. scanning FTP (no counts yet)          → "Buscando archivos en el FTP…"
 *   2. parsing files (index:progress)        → "Indexando archivos · 1.250/3.726"
 *   3. TMDB enrichment (index:tmdb_progress) → "Obteniendo metadatos · 41/312"
 */
export function indexingView(
  language: AppLanguage,
  files: { current: number; total: number } | null | undefined,
  tmdb: Counter | null | undefined,
): IndexingView {
  const filesDone = files && files.total > 0 && files.current >= files.total;
  if (tmdb && tmdb.total > 0 && (!files || files.total === 0 || filesDone)) {
    return {
      label: t(language, "toast.enriching", {
        current: formatCount(tmdb.done, language),
        total: formatCount(tmdb.total, language),
      }),
      percent: percentOf(tmdb.done, tmdb.total),
    };
  }
  if (files && files.total > 0) {
    return {
      label: t(language, "toast.indexing", {
        current: formatCount(files.current, language),
        total: formatCount(files.total, language),
      }),
      percent: percentOf(files.current, files.total),
    };
  }
  return { label: t(language, "toast.scanning"), percent: null };
}

/** "12 nuevos · 3 ya no están en el FTP" / "Sin cambios" / undefined if unknown. */
export function completionSublabel(
  language: AppLanguage,
  summary: { newItems: number | null; removed: number | null },
): string | undefined {
  if (summary.newItems == null) return undefined;
  const parts: string[] = [];
  if (summary.newItems === 1) parts.push(t(language, "toast.newItemAdded"));
  else if (summary.newItems > 1)
    parts.push(
      t(language, "toast.newItemsAdded", {
        count: formatCount(summary.newItems, language),
      }),
    );
  const removed = summary.removed ?? 0;
  if (removed === 1) parts.push(t(language, "toast.itemRemoved"));
  else if (removed > 1)
    parts.push(
      t(language, "toast.itemsRemoved", { count: formatCount(removed, language) }),
    );
  return parts.length ? parts.join(" · ") : t(language, "toast.noNewItems");
}

/**
 * Turns the raw (English, technical) error the indexer emits into a sentence
 * a user can act on. The raw text is still shown as "technical detail".
 */
export function describeIndexError(
  language: AppLanguage,
  raw: string,
): { message: string; detail?: string } {
  const r = raw.toLowerCase();
  let key:
    | "toast.error.noFiles"
    | "toast.error.auth"
    | "toast.error.timeout"
    | "toast.error.connection"
    | null = null;
  if (r.includes("0 media files")) key = "toast.error.noFiles";
  else if (/\b530\b|login|password|authentication|not logged in/.test(r))
    key = "toast.error.auth";
  else if (/timed out|timeout/.test(r)) key = "toast.error.timeout";
  else if (
    /refused|unreachable|connect|dns|resolve|network|reset by peer|os error|broken pipe/.test(r)
  )
    key = "toast.error.connection";
  if (!key) return { message: raw };
  return {
    message: t(language, key),
    detail: key === "toast.error.noFiles" ? undefined : raw,
  };
}
