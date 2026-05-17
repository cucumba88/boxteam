import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MediaItem } from "../hooks/useIndexing";
import type { DownloadItem } from "../hooks/useDownloads";
import MediaCard from "./MediaCard";
import { firstCharBucket } from "../utils/alphaJump";
import { getLocalizedTitle, type AppLanguage } from "../utils/mediaLanguage";

export interface JumpRequest {
  /** Item index into the full items[] array. */
  index: number;
  /** Increments per click so the same index re-triggers a scroll. */
  tick: number;
}

const MIN_CARD_WIDTH = 160;
const GAP = 16;
const PADDING_X = 24; // 1.5rem
const PADDING_TOP = 24;
const PADDING_BOTTOM = 104; // ~6.5rem, room for the pagination-less floating UI
const META_OVERHEAD = 46; // gap + title line + meta row
const VISIBLE_RANGE_DEBOUNCE_MS = 150;

export default memo(function VirtualMediaGrid({
  items,
  selecting,
  checkedIds,
  onToggleCheck,
  onCardSelect,
  onDownload,
  resetKey,
  language,
  badgeMap,
  downloadMap,
  hideEpisodeBadge = false,
  showFileSize = false,
  disableQuickAction = false,
  jumpRequest,
  onVisibleRangeChange,
  onFirstVisibleIndexChange,
}: {
  items: MediaItem[];
  selecting: boolean;
  checkedIds: Set<number>;
  onToggleCheck: (id: number) => void;
  onCardSelect: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  resetKey: string;
  language: AppLanguage;
  badgeMap: Record<
    number,
    {
      downloaded?: boolean;
      inEmby?: boolean;
      plexInLibrary?: boolean;
      embyInLibrary?: boolean;
      cache?: string;
      debug?: string;
    }
  >;
  downloadMap: Map<string, DownloadItem>;
  hideEpisodeBadge?: boolean;
  showFileSize?: boolean;
  disableQuickAction?: boolean;
  jumpRequest?: JumpRequest;
  onVisibleRangeChange?: (start: number, end: number) => void;
  /**
   * Fires whenever the topmost visible item index changes. Undebounced —
   * use for cheap, render-driven UI like an active-letter highlight in a
   * jump rail. For expensive work (network requests) prefer
   * `onVisibleRangeChange`, which is debounced.
   */
  onFirstVisibleIndexChange?: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width so column count + row height can react to resize.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => {
    const usable = Math.max(0, containerWidth - PADDING_X * 2);
    if (usable <= 0) return 1;
    return Math.max(1, Math.floor((usable + GAP) / (MIN_CARD_WIDTH + GAP)));
  }, [containerWidth]);

  const rowCount = Math.ceil(items.length / columns);

  const cardWidth = useMemo(() => {
    const usable = Math.max(0, containerWidth - PADDING_X * 2);
    if (usable <= 0 || columns <= 0) return MIN_CARD_WIDTH;
    return (usable - GAP * (columns - 1)) / columns;
  }, [containerWidth, columns]);

  const rowHeight = useMemo(
    () => cardWidth * 1.5 + META_OVERHEAD + GAP,
    [cardWidth],
  );

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  // Reset scroll on filter/sort/tab change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [resetKey]);

  // Re-measure when the row height changes (resize / column count change).
  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  // A-Z jump: scroll the row containing `index` into view.
  useLayoutEffect(() => {
    if (!jumpRequest) return;
    if (columns <= 0) return;
    const targetRow = Math.floor(jumpRequest.index / columns);
    if (Number.isNaN(targetRow) || targetRow < 0) return;
    rowVirtualizer.scrollToIndex(targetRow, {
      align: "start",
      behavior: "smooth",
    });
  }, [jumpRequest, columns, rowVirtualizer]);

  // Debounced visible-range emission for the parent (used for badge fetching).
  const onRangeRef = useRef(onVisibleRangeChange);
  useEffect(() => {
    onRangeRef.current = onVisibleRangeChange;
  }, [onVisibleRangeChange]);
  const onFirstIdxRef = useRef(onFirstVisibleIndexChange);
  useEffect(() => {
    onFirstIdxRef.current = onFirstVisibleIndexChange;
  }, [onFirstVisibleIndexChange]);
  const virtualRows = rowVirtualizer.getVirtualItems();
  // Indexes coming from `getVirtualItems()` include overscan, so the topmost
  // entry is actually above the viewport. Derive the truly visible first row
  // from scrollOffset instead so the active-letter highlight tracks the row
  // the user actually sees at the top.
  const scrollOffset = rowVirtualizer.scrollOffset ?? 0;
  const firstVisibleRow =
    rowHeight > 0 ? Math.max(0, Math.floor(scrollOffset / rowHeight)) : 0;
  const overscanFirstRow = virtualRows[0]?.index ?? 0;
  const overscanLastRow =
    virtualRows[virtualRows.length - 1]?.index ?? overscanFirstRow;
  // Undebounced: feeds the active-letter highlight in the jump rail.
  useEffect(() => {
    if (!onFirstIdxRef.current) return;
    if (items.length === 0) return;
    onFirstIdxRef.current(firstVisibleRow * columns);
  }, [firstVisibleRow, columns, items.length]);
  useEffect(() => {
    if (!onRangeRef.current) return;
    if (items.length === 0) return;
    // Badge fetching wants the overscan range so cards just outside the
    // viewport already have badges when they scroll in.
    const start = overscanFirstRow * columns;
    const end = Math.min(items.length, (overscanLastRow + 1) * columns);
    const cb = onRangeRef.current;
    const handle = window.setTimeout(
      () => cb(start, end),
      VISIBLE_RANGE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [overscanFirstRow, overscanLastRow, columns, items.length]);

  const rowToItems = useCallback(
    (rowIdx: number): MediaItem[] => {
      const start = rowIdx * columns;
      return items.slice(start, start + columns);
    },
    [items, columns],
  );

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflowY: "auto",
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X,
        paddingTop: PADDING_TOP,
        paddingBottom: 0,
      }}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize() + PADDING_BOTTOM,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualRows.map((vrow) => {
          const rowItems = rowToItems(vrow.index);
          return (
            <div
              key={vrow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vrow.start}px)`,
                height: vrow.size,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowItems.map((item) => (
                <div
                  key={item.id}
                  data-alpha={firstCharBucket(getLocalizedTitle(item, language))}
                  style={{ position: "relative", minWidth: 0 }}
                >
                  {selecting && (
                    <label
                      onClick={(e) => {
                        // The MediaCard click handler is the canonical toggle
                        // in selecting mode (covers the whole card surface).
                        // Stop propagation so a precise tap on the checkbox
                        // doesn't fire both handlers and end up a no-op.
                        e.stopPropagation();
                      }}
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 4,
                        zIndex: 10,
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        background:
                          "color-mix(in srgb, var(--color-bg) 65%, transparent)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.has(item.id)}
                        onChange={() => onToggleCheck(item.id)}
                        style={{
                          width: 20,
                          height: 20,
                          cursor: "pointer",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                    </label>
                  )}
                  <MediaCard
                    item={item}
                    language={language}
                    badges={badgeMap[item.id]}
                    downloadItem={downloadMap.get(item.ftp_path)}
                    hideEpisodeBadge={hideEpisodeBadge}
                    showFileSize={showFileSize}
                    disableQuickAction={disableQuickAction}
                    onDownload={onDownload}
                    onSelect={(selected) => {
                      if (selecting) onToggleCheck(selected.id);
                      else onCardSelect(selected);
                    }}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
});
