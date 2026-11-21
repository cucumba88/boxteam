import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./ui.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Stretch to the container width. */
  block?: boolean;
  children?: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 15, lg: 16 };

/**
 * The one button of the app. Pick a variant by intent:
 *  - primary   → the main action of a screen (max one per area)
 *  - secondary → other actions
 *  - ghost     → low-emphasis actions (cancel, dismiss)
 *  - danger    → destructive actions (cancel transfer, delete, reset)
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    block = false,
    className,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block ? "ui-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {Icon && <Icon size={ICON_SIZE[size]} strokeWidth={2.2} aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
