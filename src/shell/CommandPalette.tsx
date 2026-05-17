import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { foldForSearch } from "../utils/textSearch";

export type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  section: string;
  /** Pre-folded search string (lowercase, accents stripped) for matching. */
  searchKey: string;
  onSelect: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  emptyMessage?: string;
}

export default function CommandPalette({
  open,
  onClose,
  items,
  placeholder = "Search library and actions…",
  emptyMessage = "No matches",
}: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Focus on next tick so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = foldForSearch(query).trim();
    return items.filter((item) => item.searchKey.includes(q));
  }, [query, items]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  // Scroll active item into view when navigating with arrows.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmdk-index="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.section] ||= []).push(item);
    return acc;
  }, {});
  const sectionOrder = Object.keys(grouped);

  function runItem(index: number) {
    const item = filtered[index];
    if (!item) return;
    onClose();
    // Defer so close-state propagates before whatever the action does.
    requestAnimationFrame(() => item.onSelect());
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % Math.max(filtered.length, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        (h) => (h - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runItem(highlight);
    }
  }

  // Build flat index per item to keep highlight math simple while we render
  // grouped sections.
  let flatIndex = 0;

  return createPortal(
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk-panel" onKeyDown={onKeyDown}>
        <div className="cmdk-input-row">
          <Search
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div ref={listRef} className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">{emptyMessage}</div>
          ) : (
            sectionOrder.map((section) => {
              const sectionItems = grouped[section];
              return (
                <div key={section}>
                  <div className="cmdk-section-label">{section}</div>
                  {sectionItems.map((item) => {
                    const currentIndex = flatIndex++;
                    const Icon = item.icon ?? ArrowRight;
                    const active = currentIndex === highlight;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-cmdk-index={currentIndex}
                        className={`cmdk-item${active ? " active" : ""}`}
                        onMouseEnter={() => setHighlight(currentIndex)}
                        onClick={() => runItem(currentIndex)}
                      >
                        <span className="cmdk-item-icon">
                          <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                        <span className="cmdk-item-text">
                          <span className="cmdk-item-title">{item.title}</span>
                          {item.subtitle && (
                            <span className="cmdk-item-subtitle">
                              {item.subtitle}
                            </span>
                          )}
                        </span>
                        {active && (
                          <span className="cmdk-item-hint">
                            <CornerDownLeft size={11} strokeWidth={2.2} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="cmdk-footer">
          <div className="cmdk-footer-keys">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              navigate
            </span>
            <span>
              <kbd>↵</kbd>
              select
            </span>
            <span>
              <kbd>esc</kbd>
              close
            </span>
          </div>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
