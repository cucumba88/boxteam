import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { isTauri } from "../lib/transport";

/**
 * Custom min/max/close buttons for Windows and Linux where we hide the OS
 * decorations. macOS keeps native traffic-lights via `titleBarStyle: Overlay`,
 * so this component is not rendered on Mac.
 */
export default function CaptionControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        setMaximized(await win.isMaximized());
        unlisten = await win.onResized(async () => {
          setMaximized(await win.isMaximized());
        });
      } catch {
        // tauri window API not available — ignore
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  async function withWindow(action: (win: { minimize: () => Promise<void>; toggleMaximize: () => Promise<void>; close: () => Promise<void> }) => Promise<void>) {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await action(getCurrentWindow());
    } catch {
      // ignore — running outside tauri
    }
  }

  return (
    <div className="shell-caption-controls">
      <button
        type="button"
        aria-label="Minimize"
        className="shell-caption-btn"
        onClick={() => withWindow((w) => w.minimize())}
      >
        <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        className="shell-caption-btn"
        onClick={() => withWindow((w) => w.toggleMaximize())}
      >
        {maximized ? (
          <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <Square size={12} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        className="shell-caption-btn close"
        onClick={() => withWindow((w) => w.close())}
      >
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
