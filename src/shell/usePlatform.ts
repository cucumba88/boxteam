import { useEffect, useState } from "react";
import { isTauri } from "../lib/transport";

export type Platform = "macos" | "windows" | "linux" | "web";

function detectFromUserAgent(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const platform = (navigator as { platform?: string }).platform ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
    return "macos";
  }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(platform) || /Linux/i.test(ua)) return "linux";
  return "web";
}

/**
 * Synchronous platform detection. Returns 'web' when not running inside Tauri.
 * Inside Tauri, infers the host OS from the user agent — adequate for layout
 * decisions and stable across the renderer lifetime.
 */
export function usePlatform(): Platform {
  const [platform] = useState<Platform>(() => {
    if (!isTauri()) return "web";
    return detectFromUserAgent();
  });
  return platform;
}

export function getPlatformSync(): Platform {
  if (!isTauri()) return "web";
  return detectFromUserAgent();
}

/**
 * Listens for Cmd/Ctrl+K and invokes the handler. Returns nothing — set up
 * once near the shell root.
 */
export function useCommandKey(handler: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isMac = detectFromUserAgent() === "macos";
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (modifier && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler]);
}
