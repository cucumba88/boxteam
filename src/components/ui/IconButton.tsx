import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import type { ButtonSize, ButtonVariant } from "./Button";
import "./ui.css";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** Required: read by screen readers and shown as tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/** Round icon-only button. Always labelled (aria-label + title). */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon: Icon,
      label,
      variant = "secondary",
      size = "md",
      className,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const classes = [
      "ui-btn",
      "ui-icon-btn",
      `ui-btn--${variant}`,
      `ui-btn--${size}`,
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        aria-label={label}
        title={label}
        {...rest}
      >
        <Icon size={ICON_SIZE[size]} strokeWidth={2.2} aria-hidden="true" />
      </button>
    );
  },
);

export default IconButton;
