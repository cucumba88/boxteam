import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useAuth, type WebUser } from "../lib/AuthContext";
import { apiBase, getToken } from "../lib/transport";
import { formInputStandard, formSelectStandard } from "../lib/formStyles";

interface CreateForm {
  email: string;
  password: string;
  role: string;
}
interface EditForm {
  email?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
}
interface InviteResult {
  invited: boolean;
  invite_token: string;
  invite_link: string;
  expires_at: string;
  email?: string;
  role: "user" | "editor" | "admin";
}

function apiFetch(path: string, method = "GET", body?: unknown) {
  const tok = getToken();
  return fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const inputStyle = formInputStandard;
const selectStyle = formSelectStandard;

interface WebUsersProps {
  onBack?: () => void;
}

export default function WebUsers({ onBack }: WebUsersProps = {}) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<WebUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    email: "",
    password: "",
    role: "user",
  });
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [copyState, setCopyState] = useState<"link" | "token" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/users");
      setUsers(await r.json());
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await apiFetch("/users", "POST", form);
      if (!r.ok) {
        const d = await r.json();
        setError(d.error);
        return;
      }
      setForm({ email: "", password: "", role: "user" });
      setCreating(false);
      load();
    } catch {
      setError("Failed to create user");
    }
  };

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const email = inviteEmail.trim();
      const r = await apiFetch("/users/invite", "POST", {
        email: email.length ? email : null,
        role: inviteRole,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Invite failed");
        return;
      }
      setInviteResult(data as InviteResult);
      setInviteEmail("");
      setInviting(false);
      load();
    } catch {
      setError("Failed to invite user");
    }
  };

  const updateUser = async (id: number) => {
    try {
      const r = await apiFetch(`/users/${id}`, "PUT", editForm);
      if (!r.ok) {
        const d = await r.json();
        setError(d.error);
        return;
      }
      setEditId(null);
      load();
    } catch {
      setError("Failed to update user");
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    try {
      await apiFetch(`/users/${id}`, "DELETE");
      load();
    } catch {
      setError("Failed to delete user");
    }
  };

  function copy(value: string, which: "link" | "token") {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopyState(which);
        setTimeout(() => setCopyState(null), 1400);
      })
      .catch(() => {});
  }

  if (me && (me as WebUser).role !== "admin") {
    return (
      <NoAccess onBack={onBack}>
        Admin access required.
      </NoAccess>
    );
  }

  return (
    <div
      className="app-shell-bg"
      style={{
        minHeight: "100vh",
        position: "relative",
        overflowY: "auto",
      }}
    >
      {/* Sticky back bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          background: "color-mix(in srgb, var(--color-bg) 92%, transparent)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to library"
            style={chipBtn}
          >
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Volver</span>
          </button>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--color-text-muted)",
            fontSize: 12.5,
          }}
        >
          <span>Librería</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
            Gestión de usuarios
          </span>
        </div>
      </div>

      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "28px 32px 60px",
        }}
      >
        {/* Page header */}
        <header style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background:
                "color-mix(in srgb, var(--color-primary) 16%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--color-primary) 36%, transparent)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                color: "var(--color-text)",
              }}
            >
              Usuarios
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13.5,
                color: "var(--color-text-muted)",
                maxWidth: 540,
                lineHeight: 1.5,
              }}
            >
              Administra el acceso de las personas que usan Oscata. Crea
              cuentas directamente o envía un enlace de invitación.
            </p>
          </div>
        </header>

        {/* Quick actions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: inviteResult || error ? 18 : 24,
          }}
        >
          <ActionTile
            icon={<UserPlus size={18} strokeWidth={2.2} aria-hidden="true" />}
            label="Crear usuario"
            description="Con contraseña inmediata"
            primary={!creating}
            active={creating}
            onClick={() => {
              setCreating((c) => !c);
              setInviting(false);
            }}
          />
          <ActionTile
            icon={<Mail size={18} strokeWidth={2.2} aria-hidden="true" />}
            label="Invitar por correo"
            description="Comparte un enlace seguro"
            active={inviting}
            onClick={() => {
              setInviting((i) => !i);
              setCreating(false);
            }}
          />
        </div>

        {/* Invite result banner */}
        {inviteResult && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border:
                "1px solid color-mix(in srgb, var(--color-success) 36%, transparent)",
              background:
                "color-mix(in srgb, var(--color-success) 12%, transparent)",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-success)",
                marginBottom: 8,
              }}
            >
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
              Invitación creada ({inviteResult.role})
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginBottom: 10,
              }}
            >
              Caduca el {new Date(inviteResult.expires_at).toLocaleString()}
            </div>
            <code
              style={{
                display: "block",
                padding: "8px 10px",
                borderRadius: 6,
                background:
                  "color-mix(in srgb, var(--color-surface-2) 70%, transparent)",
                fontSize: 12,
                color: "var(--color-text)",
                wordBreak: "break-all",
                fontFamily: "monospace",
                marginBottom: 8,
              }}
            >
              {inviteResult.invite_link}
            </code>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={chipBtn}
                onClick={() => copy(inviteResult.invite_link, "link")}
              >
                {copyState === "link" ? (
                  <>
                    <Check size={12} strokeWidth={2.4} aria-hidden="true" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={2.2} aria-hidden="true" /> Copiar enlace
                  </>
                )}
              </button>
              <button
                style={chipBtn}
                onClick={() => copy(inviteResult.invite_token, "token")}
              >
                {copyState === "token" ? (
                  <>
                    <Check size={12} strokeWidth={2.4} aria-hidden="true" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={2.2} aria-hidden="true" /> Copiar token
                  </>
                )}
              </button>
              <button
                style={{ ...chipBtn, marginLeft: "auto" }}
                onClick={() => setInviteResult(null)}
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border:
                "1px solid color-mix(in srgb, var(--color-danger) 36%, transparent)",
              background:
                "color-mix(in srgb, var(--color-danger) 10%, transparent)",
              color: "var(--color-danger)",
              fontSize: 13,
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ flex: 1 }}>{error}</span>
            <button
              style={{ ...chipBtn, color: "var(--color-danger)" }}
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}

        {/* Forms */}
        {creating && (
          <FormCard title="Nuevo usuario" onSubmit={createUser}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <input
                style={inputStyle}
                type="email"
                placeholder="email@oscata.app"
                required
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <input
                style={inputStyle}
                type="password"
                placeholder="Contraseña (mín. 8)"
                required
                minLength={8}
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>
            <RoleSelect
              value={form.role}
              onChange={(value) => setForm((f) => ({ ...f, role: value }))}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={primaryBtn}>
                Crear usuario
              </button>
              <button
                type="button"
                style={chipBtn}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </button>
            </div>
          </FormCard>
        )}

        {inviting && (
          <FormCard title="Invitar usuario" onSubmit={inviteUser}>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--color-text-muted)",
              }}
            >
              El correo es opcional. Si lo dejas vacío, se generará un enlace
              que podrás compartir manualmente.
            </p>
            <input
              style={inputStyle}
              type="email"
              placeholder="email (opcional)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <RoleSelect value={inviteRole} onChange={setInviteRole} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={primaryBtn}>
                Generar invitación
              </button>
              <button
                type="button"
                style={chipBtn}
                onClick={() => setInviting(false)}
              >
                Cancelar
              </button>
            </div>
          </FormCard>
        )}

        {/* User list */}
        <section style={{ marginTop: 8 }}>
          <header
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              Cuentas
            </h2>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {loading ? "Cargando…" : `${users.length} cuenta${users.length === 1 ? "" : "s"}`}
            </span>
          </header>

          {loading ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 13,
              }}
            >
              Cargando…
            </div>
          ) : users.length === 0 ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 13,
              }}
            >
              No hay cuentas todavía.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {users.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  isMe={(me as WebUser)?.id === u.id}
                  editing={editId === u.id}
                  editForm={editForm}
                  onStartEdit={() => {
                    setEditId(u.id);
                    setEditForm({});
                  }}
                  onCancelEdit={() => setEditId(null)}
                  onEditChange={setEditForm}
                  onSave={() => updateUser(u.id)}
                  onDelete={() => deleteUser(u.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function ActionTile({
  icon,
  label,
  description,
  primary,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  primary?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 14,
        border: active
          ? "1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
        background: active
          ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
          : primary
            ? "color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))"
            : "color-mix(in srgb, var(--color-surface) 80%, transparent)",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background:
            "color-mix(in srgb, var(--color-primary) 20%, transparent)",
          color: "var(--color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--color-text-muted)",
          }}
        >
          {description}
        </span>
      </span>
    </button>
  );
}

function FormCard({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
        background: "color-mix(in srgb, var(--color-surface) 88%, transparent)",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      {children}
    </form>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      style={selectStyle}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="user">Usuario</option>
      <option value="editor">Editor</option>
      <option value="admin">Administrador</option>
    </select>
  );
}

function RolePill({ role }: { role: string }) {
  const palette =
    role === "admin"
      ? {
          bg: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
          fg: "var(--color-primary)",
        }
      : role === "editor"
        ? {
            bg: "color-mix(in srgb, var(--color-info) 16%, transparent)",
            fg: "var(--color-info)",
          }
        : {
            bg: "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
            fg: "var(--color-text-muted)",
          };
  const label =
    role === "admin"
      ? "Administrador"
      : role === "editor"
        ? "Editor"
        : "Usuario";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 9px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

function UserCard({
  user,
  isMe,
  editing,
  editForm,
  onStartEdit,
  onCancelEdit,
  onEditChange,
  onSave,
  onDelete,
}: {
  user: WebUser;
  isMe: boolean;
  editing: boolean;
  editForm: EditForm;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (patch: EditForm) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const initial = user.email.charAt(0).toUpperCase();
  if (editing) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 16px",
          borderRadius: 14,
          border:
            "1px solid color-mix(in srgb, var(--color-primary) 36%, transparent)",
          background: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 10,
          }}
        >
          <input
            style={inputStyle}
            type="email"
            placeholder="Email"
            defaultValue={user.email}
            onChange={(e) =>
              onEditChange({ ...editForm, email: e.target.value })
            }
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="Nueva contraseña (opcional)"
            onChange={(e) =>
              onEditChange({
                ...editForm,
                password: e.target.value || undefined,
              })
            }
          />
          <RoleSelect
            value={editForm.role ?? user.role}
            onChange={(value) => onEditChange({ ...editForm, role: value })}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={primaryBtn} onClick={onSave}>
            Guardar
          </button>
          <button type="button" style={chipBtn} onClick={onCancelEdit}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        borderRadius: 14,
        border:
          "1px solid color-mix(in srgb, var(--color-border) 45%, transparent)",
        background:
          "color-mix(in srgb, var(--color-surface) 84%, transparent)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background:
            "color-mix(in srgb, var(--color-primary) 16%, transparent)",
          color: "var(--color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span title={user.email}>{user.email}</span>
          {isMe && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              · tú
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <RolePill role={user.role} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: user.is_active
                ? "var(--color-success)"
                : "var(--color-danger)",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: user.is_active
                  ? "var(--color-success)"
                  : "var(--color-danger)",
              }}
            />
            {user.is_active ? "Activo" : "Inactivo"}
          </span>
        </div>
      </div>
      <button
        type="button"
        style={chipBtn}
        onClick={onStartEdit}
        aria-label="Editar"
      >
        <Pencil size={12} strokeWidth={2.2} aria-hidden="true" />
        <span>Editar</span>
      </button>
      {!isMe && (
        <button
          type="button"
          style={{
            ...chipBtn,
            color: "var(--color-danger)",
            borderColor:
              "color-mix(in srgb, var(--color-danger) 40%, transparent)",
          }}
          onClick={onDelete}
          aria-label="Eliminar"
        >
          <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function NoAccess({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div
      className="app-shell-bg"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        color: "var(--color-text-muted)",
      }}
    >
      <div style={{ fontSize: 14 }}>{children}</div>
      {onBack && (
        <button type="button" style={chipBtn} onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>Volver</span>
        </button>
      )}
    </div>
  );
}

const chipBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  border:
    "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
  background: "color-mix(in srgb, var(--color-surface) 85%, transparent)",
  color: "var(--color-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
