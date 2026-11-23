import { useEffect } from "react";
import { isTauri } from "../../lib/transport";
import { checkForUpdate } from "./updateStore";

/** Let the library load first; the check is a single small request. */
const FIRST_CHECK_DELAY_MS = 15_000;
/** The app is often left open for days in the tray. */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Checks for a new version shortly after startup and every 6 hours. Desktop only. */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    if (!isTauri()) return;
    const first = window.setTimeout(() => void checkForUpdate(), FIRST_CHECK_DELAY_MS);
    const every = window.setInterval(() => void checkForUpdate(), RECHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
