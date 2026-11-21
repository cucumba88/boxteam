import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./ui.css";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface StatusBadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  /** Spin the icon (in-progress states). */
  spin?: boolean;
  title?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Pill that pairs an icon with text so status never relies on colour alone. */
export default function StatusBadge({
  tone = "neutral",
  icon: Icon,
  spin = false,
  title,
  style,
  children,
}: StatusBadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}`} title={title} style={style}>
      {Icon && (
        <Icon
          size={12}
          strokeWidth={2.4}
          aria-hidden="true"
          className={spin ? "ui-spin" : undefined}
        />
      )}
      {children}
    </span>
  );
}
