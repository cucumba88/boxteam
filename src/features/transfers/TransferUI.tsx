/**
 * Shared building blocks for the Downloads and Uploads tabs.
 *
 * Both tabs show the same thing (a queue, progress, retries and a history),
 * so they must look the same: same stat cards, section headers, filter
 * chips, row card, status badge, progress block, error box and buttons.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import StatusBadge, { type BadgeTone } from "../../components/ui/StatusBadge";
import { formatBytes } from "../../lib/format";
import { formatEta, formatSpeed, percentOf } from "../../lib/progressFormat";
import { t } from "../../utils/i18n";
import type { AppLanguage } from "../../utils/mediaLanguage";

export type TransferStatus =
  | "queued"
  | "active"
  | "done"
  | "error"
  | "cancelled";

export const STATUS_TONE: Record<TransferStatus, BadgeTone> = {
  queued: "neutral",
  active: "primary",
  done: "success",
  error: "danger",
  cancelled: "neutral",
};

export const STATUS_ICON: Record<TransferStatus, LucideIcon> = {
  queued: Clock,
  active: Loader2,
  done: Check,
  error: AlertCircle,
  cancelled: X,
};

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: "var(--color-text-muted)",
  primary: "var(--color-primary)",
  info: "var(--color-info)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

// ─── Formatting ──────────────────────────────────────────────────────────────

// Speed / ETA live in lib/progressFormat so download rings, transfer rows and
// the toolbar total all print the same units.
export { formatSpeed, formatEta } from "../../lib/progressFormat";

export function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

/** Sticky toolbar: filter chips on the left, actions on the right. */
export function TransferToolbar({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 1.5rem",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        flexShrink: 0,
        borderBottom:
          "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
      }}
    >
      {left}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function TransferBody({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "16px 1.5rem calc(80px + env(safe-area-inset-bottom, 0px))",
        maxWidth: 1100,
        margin: "0 auto",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

export interface FilterChipDef<T extends string> {
  id: T;
  label: string;
  count: number;
}

export function TransferFilterChips<T extends string>({
  chips,
  active,
  onChange,
}: {
  chips: FilterChipDef<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="group"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      {chips.map((chip) => {
        const on = chip.id === active;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(chip.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: on
                ? "1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)"
                : "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
              background: on
                ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                : "color-mix(in srgb, var(--color-surface) 70%, transparent)",
              color: on ? "var(--color-primary)" : "var(--color-text)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span>{chip.label}</span>
            <span style={{ opacity: 0.7, fontSize: 11, fontWeight: 600 }}>
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface StatDef {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: BadgeTone;
}

/** Four summary cards: icon, big number, label. */
export function TransferStats({ stats }: { stats: StatDef[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
      }}
    >
      {stats.map(({ icon: Icon, label, value, tone }) => {
        const color = TONE_COLOR[tone];
        return (
          <div
            key={label}
            style={{
              borderRadius: "var(--radius-lg)",
              border:
                "1px solid color-mix(in srgb, var(--color-border) 78%, transparent)",
              background: "var(--color-surface)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
                flexShrink: 0,
              }}
            >
              <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: value > 0 ? "var(--color-text)" : "var(--color-text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TransferSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
        <h2
          style={{
            margin: 0,
            flex: 1,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {title}
          {count != null && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span>
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function TransferEmptySection({
  icon: Icon,
  text,
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "1rem 1.1rem",
        borderRadius: "var(--radius-lg)",
        border:
          "1px dashed color-mix(in srgb, var(--color-border) 74%, transparent)",
        color: "var(--color-text-muted)",
        fontSize: 13,
      }}
    >
      <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/** Whole-tab empty state, same shape as the library's. */
export function TransferEmpty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
        padding: "56px 20px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
          color: "var(--color-primary)",
        }}
      >
        <Icon size={26} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          maxWidth: 440,
          lineHeight: 1.6,
        }}
      >
        {body}
      </div>
      {action}
    </div>
  );
}

// ─── Row card ────────────────────────────────────────────────────────────────

export function TransferCard({
  status,
  statusLabel,
  title,
  subtitle,
  extraBadge,
  children,
  actions,
}: {
  status: TransferStatus;
  statusLabel: string;
  title: string;
  subtitle?: string;
  /** Optional second badge (e.g. "Reintentando 2/3"). */
  extraBadge?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const tone = STATUS_TONE[status];
  const color = TONE_COLOR[tone];
  const Icon = STATUS_ICON[status];
  return (
    <article
      style={{
        borderRadius: "var(--radius-lg)",
        border:
          "1px solid color-mix(in srgb, var(--color-border) 78%, transparent)",
        background: "var(--color-surface)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
            flexShrink: 0,
          }}
        >
          <Icon
            size={17}
            strokeWidth={2.15}
            aria-hidden="true"
            className={status === "active" ? "ui-spin" : undefined}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text)",
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          {subtitle && subtitle !== title && (
            <div
              title={subtitle}
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {extraBadge}
          <StatusBadge tone={tone} icon={Icon} spin={status === "active"}>
            {statusLabel}
          </StatusBadge>
        </div>
      </div>
      {children}
      {actions && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {actions}
        </div>
      )}
    </article>
  );
}

export function TransferProgress({
  language,
  done,
  total,
  speedBps,
  direction,
}: {
  language: AppLanguage;
  done: number;
  total: number;
  /** undefined → still measuring; 0 → no bytes for a while (stalled). */
  speedBps?: number | null;
  direction: "down" | "up";
}) {
  // Size not known yet (the FTP SIZE reply hasn't arrived): show an
  // indeterminate bar instead of "0% · 0 B / 0 B".
  const pct = percentOf(done, total);
  const speed = formatSpeed(speedBps);
  const eta = pct == null ? "" : formatEta(language, speedBps, total - done);
  const arrow = direction === "down" ? "↓" : "↑";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 12,
          color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>
          {pct == null ? (
            <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
              {t(language, "transfers.preparing")}
            </span>
          ) : (
            <>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{pct}%</span>
              {" · "}
              {formatBytes(done)} / {formatBytes(total)}
            </>
          )}
        </span>
        <span style={{ display: "inline-flex", gap: 10 }}>
          {speed ? (
            <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>
              {arrow} {speed}
            </span>
          ) : (
            <span>
              {speedBps === 0
                ? t(language, "transfers.stalled")
                : t(language, "transfers.measuringSpeed")}
            </span>
          )}
          {eta && <span>{eta}</span>}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-busy={pct == null || undefined}
        className={pct == null ? "ui-progress-indeterminate" : undefined}
        style={{
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--color-surface-2)",
          position: "relative",
        }}
      >
        {pct != null && (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 999,
              background: "var(--color-primary)",
              transition: "width 0.35s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "var(--color-surface-2)",
  color: "var(--color-text-muted)",
  fontSize: 11.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

/** Small grey facts row: size, elapsed time, path… */
export function TransferMeta({
  items,
}: {
  items: Array<{ key: string; label: ReactNode; title?: string; accent?: boolean } | null | false>;
}) {
  const shown = items.filter(Boolean) as Array<{
    key: string;
    label: ReactNode;
    title?: string;
    accent?: boolean;
  }>;
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {shown.map((m) => (
        <span
          key={m.key}
          title={m.title}
          style={
            m.accent
              ? {
                  ...pillStyle,
                  color: "#a78bfa",
                  background: "color-mix(in srgb, #a78bfa 12%, transparent)",
                }
              : pillStyle
          }
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

export function TransferNote({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--color-text-muted)",
        fontSize: 12,
      }}
    >
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {text}
    </div>
  );
}

export function TransferError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        borderRadius: "var(--radius)",
        border: "1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)",
        background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
        padding: "8px 10px",
        color: "var(--color-danger)",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <AlertCircle size={14} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ wordBreak: "break-word" }}>{message}</span>
    </div>
  );
}
