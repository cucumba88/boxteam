import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AppIcon from "./AppIcon";
import { formInputStandard } from "../lib/formStyles";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** What the action removes — rendered as a list with a ✕ marker. */
  removes?: string[];
  /** What the action keeps — rendered as a list with a ✓ marker. */
  keeps?: string[];
  confirmLabel: string;
  cancelLabel: string;
  busyLabel?: string;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact phrase. Use it for irreversible, high-impact actions.
   */
  confirmPhrase?: string;
  confirmPhrasePrompt?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive-action confirmation dialog. Escape and backdrop clicks cancel
 * (unless busy); focus starts on Cancel so Enter never confirms by accident.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  removes = [],
  keeps = [],
  confirmLabel,
  cancelLabel,
  busyLabel,
  confirmPhrase,
  confirmPhrasePrompt,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const [confirmHovered, setConfirmHovered] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTyped("");
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phraseOk =
    !confirmPhrase || typed.trim().toUpperCase() === confirmPhrase.toUpperCase();
  const canConfirm = phraseOk && !busy;

  return createPortal(
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--color-surface)",
          border:
            "1px solid color-mix(in srgb, var(--color-danger) 45%, var(--color-border))",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-danger)",
              background:
                "color-mix(in srgb, var(--color-danger) 16%, transparent)",
              flexShrink: 0,
            }}
          >
            <AppIcon name="trash" size={18} strokeWidth={2.1} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              {title}
            </h2>
            <p
              id={descId}
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--color-text-muted)",
              }}
            >
              {description}
            </p>
          </div>
        </div>

        {(removes.length > 0 || keeps.length > 0) && (
          <ul
            style={{
              margin: 0,
              padding: "12px 14px",
              listStyle: "none",
              display: "grid",
              gap: 6,
              borderRadius: "var(--radius)",
              background:
                "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
              fontSize: 13,
            }}
          >
            {removes.map((r) => (
              <li key={`r-${r}`} style={{ display: "flex", gap: 8, color: "var(--color-text)" }}>
                <span aria-hidden="true" style={{ color: "var(--color-danger)", fontWeight: 700 }}>
                  ✕
                </span>
                {r}
              </li>
            ))}
            {keeps.map((k) => (
              <li key={`k-${k}`} style={{ display: "flex", gap: 8, color: "var(--color-text-muted)" }}>
                <span aria-hidden="true" style={{ color: "var(--color-success)", fontWeight: 700 }}>
                  ✓
                </span>
                {k}
              </li>
            ))}
          </ul>
        )}

        {confirmPhrase && (
          <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--color-text)" }}>
            {confirmPhrasePrompt}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              style={formInputStandard}
            />
          </label>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 13, color: "var(--color-danger)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "9px 14px",
              borderRadius: "var(--radius-full)",
              border:
                "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
              background: "color-mix(in srgb, var(--color-surface) 88%, transparent)",
              color: "var(--color-text)",
              cursor: busy ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "background 0.15s ease",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            onMouseEnter={() => setConfirmHovered(true)}
            onMouseLeave={() => setConfirmHovered(false)}
            style={{
              padding: "9px 14px",
              borderRadius: "var(--radius-full)",
              border: "none",
              background: "var(--color-danger)",
              color: "#fff",
              cursor: canConfirm ? "pointer" : "not-allowed",
              opacity: canConfirm ? (confirmHovered ? 0.88 : 1) : 0.45,
              fontSize: 13,
              fontWeight: 700,
              transition: "opacity 0.15s ease",
            }}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
