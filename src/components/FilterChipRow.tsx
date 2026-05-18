import { useEffect, useMemo, useRef } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { MediaItem } from "../hooks/useIndexing";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { GENRE_LIST } from "../utils/genres";
import { type Filters } from "../utils/filterUtils";

const SORT_OPTIONS = [
  { value: "release-desc", labelKey: "filter.sort.releaseDesc" },
  { value: "added-desc", labelKey: "filter.sort.addedDesc" },
  { value: "rating-desc", labelKey: "filter.sort.ratingDesc" },
  { value: "title-asc", labelKey: "filter.sort.titleAsc" },
  { value: "year-desc", labelKey: "filter.sort.yearDesc" },
] as const;

const RES_LABELS: Record<string, string> = {
  "2160P": "4K",
  "1080P": "1080p",
  "720P": "720p",
  "480P": "480p",
};

interface Props {
  filters: Filters;
  items: MediaItem[];
  language: AppLanguage;
  onChange: (next: Filters) => void;
  onOpenFilters: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Slim filter row that lives above the content grid. Holds the search input,
 * sort dropdown, active-filter chips (each removable), and a "More filters"
 * button that opens the full FilterBar in a right-side sheet.
 *
 * Replaces the 320px left rail that competed with the new app sidebar.
 */
export default function FilterChipRow({
  filters,
  items,
  language,
  onChange,
  onOpenFilters,
  searchInputRef,
}: Props) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const inputRef = searchInputRef ?? localRef;

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filters.releaseType) {
      chips.push({
        key: `type:${filters.releaseType}`,
        label: filters.releaseType,
        clear: () => onChange({ ...filters, releaseType: "" }),
      });
    }
    if (filters.resolution) {
      chips.push({
        key: `res:${filters.resolution}`,
        label: RES_LABELS[filters.resolution] ?? filters.resolution,
        clear: () => onChange({ ...filters, resolution: "" }),
      });
    }
    if (filters.hdr) {
      chips.push({
        key: `hdr:${filters.hdr}`,
        label: filters.hdr === "DV" ? "Dolby Vision" : filters.hdr,
        clear: () => onChange({ ...filters, hdr: "" }),
      });
    }
    if (filters.codec) {
      chips.push({
        key: `codec:${filters.codec}`,
        label: filters.codec,
        clear: () => onChange({ ...filters, codec: "" }),
      });
    }
    if (filters.genre) {
      const id = Number(filters.genre);
      const genre = GENRE_LIST.find((g) => g.id === id);
      chips.push({
        key: `genre:${filters.genre}`,
        label: genre ? t(language, genre.i18nKey as never) : filters.genre,
        clear: () => onChange({ ...filters, genre: "" }),
      });
    }
    return chips;
    // items is intentionally excluded; chips don't depend on the catalog.
  }, [filters, language, onChange]);

  const activeFilterCount = activeChips.length + (filters.search ? 1 : 0);

  // `/` focuses the search input (skip if typing in another input).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputRef]);

  const clearAll = () =>
    onChange({
      ...filters,
      search: "",
      releaseType: "",
      resolution: "",
      hdr: "",
      codec: "",
      genre: "",
    });

  // De-emphasise unused stats (e.g. when items is empty we still render so the
  // search box is always available).
  void items;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        width: "100%",
      }}
    >
      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 34,
          padding: "0 10px",
          width: 280,
          maxWidth: "100%",
          borderRadius: "var(--radius)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
          background:
            "color-mix(in srgb, var(--color-surface) 90%, transparent)",
        }}
      >
        <Search
          size={13}
          strokeWidth={2.2}
          aria-hidden="true"
          style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
        />
        <input
          ref={inputRef}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder={t(language, "filter.searchPlaceholder")}
          aria-label={t(language, "filter.searchPlaceholder")}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--color-text)",
            // 16px minimum prevents iOS Safari from auto-zooming the page
            // when the input gains focus.
            fontSize: 16,
            fontFamily: "inherit",
          }}
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: "" })}
            aria-label={t(language, "filter.clear")}
            style={{
              flexShrink: 0,
              background: "none",
              border: "none",
              padding: 2,
              cursor: "pointer",
              color: "var(--color-text-muted)",
              lineHeight: 0,
            }}
          >
            <X size={12} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Sort */}
      <select
        value={filters.sort}
        onChange={(e) =>
          onChange({ ...filters, sort: e.target.value as Filters["sort"] })
        }
        aria-label={t(language, "filter.sort")}
        style={{
          height: 34,
          padding: "0 28px 0 10px",
          borderRadius: "var(--radius)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
          background:
            "color-mix(in srgb, var(--color-surface) 90%, transparent)",
          color: "var(--color-text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(language, option.labelKey)}
          </option>
        ))}
      </select>

      {/* Active filter chips */}
      {activeChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          title={`${chip.label} — ${t(language, "filter.clear")}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 28,
            padding: "0 8px 0 10px",
            borderRadius: 999,
            border:
              "1px solid color-mix(in srgb, var(--color-primary) 36%, transparent)",
            background:
              "color-mix(in srgb, var(--color-primary) 14%, transparent)",
            color: "var(--color-primary)",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <span>{chip.label}</span>
          <X size={11} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted)",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t(language, "filter.clear")}
        </button>
      )}

      <button
        type="button"
        onClick={onOpenFilters}
        title={t(language, "filter.filters")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 12px",
          borderRadius: "var(--radius)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
          background:
            "color-mix(in srgb, var(--color-surface) 90%, transparent)",
          color: "var(--color-text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <SlidersHorizontal
          size={13}
          strokeWidth={2.2}
          aria-hidden="true"
          style={{ color: "var(--color-text-muted)" }}
        />
        <span>{t(language, "filter.filters")}</span>
        {activeFilterCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}
