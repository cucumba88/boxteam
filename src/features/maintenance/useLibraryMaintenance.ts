import { useCallback, useState } from "react";
import { call, isTauri } from "../../lib/transport";

export type MaintenanceTask = "metadata" | "providers" | "rematch";

export type MaintenanceStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done" }
  | { state: "started" }
  | { state: "error"; message: string };

const COMMANDS: Record<MaintenanceTask, string> = {
  metadata: "refresh_all_metadata",
  providers: "refresh_watch_providers",
  rematch: "rematch_all",
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Manual triggers for the library jobs that also run automatically at
 * startup and every 15 minutes. On desktop the command resolves when the
 * job finishes ("done"); the web API only acknowledges that the job was
 * spawned ("started").
 */
export function useLibraryMaintenance() {
  const [status, setStatus] = useState<Record<MaintenanceTask, MaintenanceStatus>>({
    metadata: { state: "idle" },
    providers: { state: "idle" },
    rematch: { state: "idle" },
  });

  const run = useCallback(async (task: MaintenanceTask) => {
    setStatus((s) => ({ ...s, [task]: { state: "running" } }));
    try {
      await call(COMMANDS[task]);
      setStatus((s) => ({
        ...s,
        [task]: { state: isTauri() ? "done" : "started" },
      }));
    } catch (err: unknown) {
      setStatus((s) => ({
        ...s,
        [task]: { state: "error", message: errorMessage(err) },
      }));
    }
  }, []);

  const anyRunning = Object.values(status).some((s) => s.state === "running");

  return { status, run, anyRunning };
}
