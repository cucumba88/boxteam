import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import FilterBar from "./FilterBar";
import type { Filters } from "../utils/filterUtils";
import type { MediaItem } from "../hooks/useIndexing";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  items: MediaItem[];
  language: AppLanguage;
  onChange: (next: Filters) => void;
}

/**
 * Right-side drawer holding the full FilterBar. Opens from the chip row's
 * "More filters" button; closes on backdrop click or Esc.
 */
export default function FilterSheet({
  open,
  onClose,
  filters,
  items,
  language,
  onChange,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, black 50%, transparent)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: "var(--z-filter-drawer-backdrop)" as never,
          animation: "fade-in 0.18s ease-out",
        }}
      />
      <aside
        role="dialog"
        aria-label={t(language, "filter.filters")}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(380px, 92vw)",
          background: "var(--color-bg)",
          borderLeft:
            "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
          boxShadow:
            "-12px 0 36px color-mix(in srgb, black 38%, transparent)",
          zIndex: "var(--z-filter-drawer)" as never,
          display: "flex",
          flexDirection: "column",
          animation: "filter-sheet-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom:
              "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text)",
            }}
          >
            {t(language, "filter.filters")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, "filter.clear")}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 14px 18px",
          }}
        >
          <FilterBar
            filters={filters}
            items={items}
            language={language}
            onChange={onChange}
            hideHeader
            hideSearch
          />
        </div>
      </aside>
    </>,
    document.body,
  );
}
