import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { call } from "../lib/transport";

interface Props {
  email: string;
  role: string;
  onClose: () => void;
}

/**
 * "Mi cuenta" modal. Lets the authenticated user change their own password.
 * Server enforces:
 *   - current password is correct (re-auth check)
 *   - new password ≥ 8 chars and different from current
 *   - all *other* sessions for this user are revoked on success
 */
export default function AccountModal({ email, role, onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      setStatus("error");
      setMessage("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      setStatus("error");
      setMessage("La nueva contraseña y la confirmación no coinciden.");
      return;
    }
    if (next === current) {
      setStatus("error");
      setMessage("La nueva contraseña debe ser diferente de la actual.");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const res = await call<{ ok: boolean; other_sessions_revoked: number }>(
        "change_password",
        { currentPassword: current, newPassword: next },
      );
      setStatus("ok");
      const revoked = res?.other_sessions_revoked ?? 0;
      setMessage(
        revoked > 0
          ? `Contraseña actualizada. Se cerraron ${revoked} otras sesiones activas.`
          : "Contraseña actualizada.",
      );
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(String(err instanceof Error ? err.message : err));
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "var(--radius)",
    border: "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
    background: "var(--color-surface-2)",
    color: "var(--color-text)",
    fontSize: 13,
    outline: "none",
  };

  return createPortal(
    <div
      onClick={onClose}
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
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              Mi cuenta
            </h2>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "var(--color-text-muted)",
              }}
            >
              {email}
              <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
              <span style={{ textTransform: "capitalize" }}>{role}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Cambiar contraseña
          </h3>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={fieldStyle}
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Nueva contraseña (mín. 8 caracteres)
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              style={fieldStyle}
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Confirmar nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={fieldStyle}
            />
          </label>

          {message && (
            <div
              style={{
                fontSize: 12,
                padding: "8px 10px",
                borderRadius: "var(--radius)",
                background:
                  status === "ok"
                    ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                    : "color-mix(in srgb, var(--color-danger) 18%, transparent)",
                color:
                  status === "ok"
                    ? "var(--color-success)"
                    : "var(--color-danger)",
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                background: "transparent",
                color: "var(--color-text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={status === "saving"}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: status === "saving" ? "wait" : "pointer",
                opacity: status === "saving" ? 0.6 : 1,
              }}
            >
              {status === "saving" ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
