import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";

export interface ActivityTask {
  id: string;
  label: string;
  /** 0–100, or null while the total isn't known yet. */
  percent: number | null;
}

interface ActivityIndicatorProps {
  language: AppLanguage;
  tasks: ActivityTask[];
}

/** Average progress of the tasks that report one (null if none do). */
function overallPercent(tasks: ActivityTask[]): number | null {
  const known = tasks.filter((task) => task.percent != null);
  if (known.length === 0) return null;
  const sum = known.reduce((acc, task) => acc + (task.percent ?? 0), 0);
  return Math.round(sum / known.length);
}

/**
 * Discreet "something is running" chip for the status bar. Shows a spinner,
 * the task (or how many) and the overall percent; clicking it opens a small
 * popover with every task and its own progress bar.
 */
export default function ActivityIndicator({
  language,
  tasks,
}: ActivityIndicatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const percent = overallPercent(tasks);
  const summary =
    tasks.length === 1
      ? tasks[0].label
      : t(language, "statusbar.tasksRunning", { count: String(tasks.length) });

  return (
    <div ref={rootRef} className="shell-activity">
      <button
        type="button"
        className="shell-activity-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${t(language, "statusbar.tasksTitle")}: ${summary}`}
        title={t(language, "statusbar.tasksShow")}
        onClick={() => setOpen((v) => !v)}
      >
        <LoaderCircle
          size={12}
          strokeWidth={2.4}
          aria-hidden="true"
          className="shell-statusbar-icon-spin"
        />
        <span className="shell-activity-summary">{summary}</span>
        {percent != null && (
          <span className="shell-activity-percent">{percent}%</span>
        )}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={t(language, "statusbar.tasksTitle")}
          className="shell-activity-popover"
        >
          <div className="shell-activity-popover-title">
            {t(language, "statusbar.tasksTitle")}
          </div>
          <ul className="shell-activity-list">
            {tasks.map((task) => (
              <li key={task.id} className="shell-activity-row">
                <div className="shell-activity-row-head">
                  <span className="shell-activity-row-label">{task.label}</span>
                  <span className="shell-activity-percent">
                    {task.percent != null ? `${task.percent}%` : "…"}
                  </span>
                </div>
                <div
                  className={`shell-activity-bar${
                    task.percent == null ? " indeterminate" : ""
                  }`}
                  role="progressbar"
                  aria-label={task.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={task.percent ?? undefined}
                >
                  <div style={{ width: `${task.percent ?? 35}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="shell-activity-hint">
            {t(language, "statusbar.tasksHint")}
          </div>
        </div>
      )}
    </div>
  );
}
