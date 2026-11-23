import "../../shell/shell.css";

/** Download bar (same look as the status-bar activity bar); indeterminate while the size is unknown. */
export default function UpdateProgress({ percent }: { percent: number | null }) {
  return (
    <div
      className={`shell-activity-bar${percent === null ? " indeterminate" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      style={{ marginTop: 8 }}
    >
      <div style={{ width: `${percent ?? 30}%` }} />
    </div>
  );
}
