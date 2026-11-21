import { useCallback, useState } from "react";
import { call } from "../../lib/transport";
import { invalidateMedia } from "../../lib/mediaCache";
import { invalidateConfig } from "../../lib/configCache";

export type ResetKind = "library" | "factory";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Library reset and factory reset. All backend access for the danger zone
 * lives here so the component only renders.
 */
export function useAppReset({
  onLibraryReset,
}: {
  /** Called after the library was wiped, to clear the grid and start indexing. */
  onLibraryReset?: () => void;
}) {
  const [busy, setBusy] = useState<ResetKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetLibrary = useCallback(async (): Promise<boolean> => {
    setBusy("library");
    setError(null);
    try {
      await call<number>("reset_library");
      invalidateMedia();
      onLibraryReset?.();
      return true;
    } catch (err: unknown) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }, [onLibraryReset]);

  const factoryReset = useCallback(async (): Promise<boolean> => {
    setBusy("factory");
    setError(null);
    try {
      await call("factory_reset");
      invalidateMedia();
      invalidateConfig();
      // Full reload: the router re-reads has_config and opens the setup wizard.
      window.location.reload();
      return true;
    } catch (err: unknown) {
      setError(errorMessage(err));
      setBusy(null);
      return false;
    }
  }, []);

  return {
    busy,
    error,
    clearError: () => setError(null),
    resetLibrary,
    factoryReset,
  };
}
