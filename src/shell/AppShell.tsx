import { ReactNode } from "react";
import { Search } from "lucide-react";
import CaptionControls from "./CaptionControls";
import { usePlatform } from "./usePlatform";
import "./shell.css";

interface Props {
  sidebar?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
  /** Window title shown center-aligned in the drag strip. */
  title?: string;
  /** When provided, the titlebar shows a "⌘K" hint that opens the palette. */
  onOpenCommandPalette?: () => void;
}

/**
 * Layout root for the desktop application shell.
 *
 * Renders a draggable top strip (with native traffic-light spacing on macOS
 * and custom caption controls on Windows/Linux), an optional sidebar, the
 * children content area, and an optional status bar pinned to the bottom.
 *
 * On mobile (≤767px) the chrome collapses — children render full-bleed and
 * the host page is responsible for any bottom tab bar.
 */
export default function AppShell({
  sidebar,
  statusBar,
  children,
  title = "BoxTeam",
  onOpenCommandPalette,
}: Props) {
  const platform = usePlatform();
  const isMac = platform === "macos";
  const showCaptionControls = platform === "windows" || platform === "linux";

  return (
    <div className="shell-root app-shell-bg">
      {platform !== "web" && (
        <div
          className="shell-titlebar"
          data-platform={platform}
          data-tauri-drag-region
        >
          <span className="shell-titlebar-title">{title}</span>
          {onOpenCommandPalette && (
            <button
              type="button"
              className="shell-titlebar-hint"
              onClick={onOpenCommandPalette}
              title="Search library and actions"
              style={{ marginRight: showCaptionControls ? 8 : 0 }}
            >
              <Search size={11} strokeWidth={2.2} aria-hidden="true" />
              <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
              <kbd>K</kbd>
            </button>
          )}
          {showCaptionControls && <CaptionControls />}
        </div>
      )}

      <div className="shell-body">
        {sidebar}
        <main className="shell-content">{children}</main>
      </div>

      {statusBar}
    </div>
  );
}
