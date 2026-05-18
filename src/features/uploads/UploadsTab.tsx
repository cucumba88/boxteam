import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Upload,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
} from "lucide-react";
import UploadCard from "./UploadCard";
import UploadPrepareModal from "./UploadPrepareModal";
import type { UploadItem } from "./types";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";

interface UploadsTabProps {
  uploads: UploadItem[];
  language: AppLanguage;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
  onClearCompleted: () => void;
}

export default function UploadsTab({
  uploads,
  language,
  onCancel,
  onRetry,
  onDelete,
  onClearCompleted,
}: UploadsTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [ffprobeAvailable, setFfprobeAvailable] = useState(false);
  const [writeOk, setWriteOk] = useState<boolean | null>(null);
  const [checkingWrite, setCheckingWrite] = useState(true);

  useEffect(() => {
    invoke<string | null>("check_ffprobe")
      .then((p) => setFfprobeAvailable(p != null))
      .catch(() => setFfprobeAvailable(false));

    invoke<boolean>("check_ftp_write_permission")
      .then((ok) => setWriteOk(ok))
      .catch(() => setWriteOk(false))
      .finally(() => setCheckingWrite(false));
  }, []);

  const active = uploads.filter(
    (u) => u.status === "uploading" || u.status === "queued",
  );
  const history = uploads.filter(
    (u) =>
      u.status === "done" || u.status === "error" || u.status === "cancelled",
  );

  const uploading = uploads.filter((u) => u.status === "uploading").length;
  const queued = uploads.filter((u) => u.status === "queued").length;
  const done = uploads.filter((u) => u.status === "done").length;
  const errors = uploads.filter((u) => u.status === "error").length;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar — chip-row pattern shared with Watchlist / Downloads.
          Library's outer toolbar already shows "Subidas N titles", so we
          skip a bespoke page header here. */}
      <div
        style={{
          padding: "10px 1.5rem",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flexShrink: 0,
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {!checkingWrite && writeOk === false && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 36%, transparent)",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12,
                color: "var(--color-danger)",
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={13} aria-hidden="true" />
              {t(language, "uploads.noFtpWrite")}
            </div>
          )}

          <div style={{ flex: 1 }} />

          <button
            disabled={!checkingWrite && writeOk === false}
            onClick={() => setShowModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 700,
              cursor:
                !checkingWrite && writeOk === false ? "not-allowed" : "pointer",
              opacity: !checkingWrite && writeOk === false ? 0.5 : 1,
              fontFamily: "inherit",
              boxShadow:
                "0 4px 14px color-mix(in srgb, var(--color-primary) 36%, transparent)",
            }}
          >
            <Upload size={13} strokeWidth={2.5} aria-hidden="true" />
            {t(language, "uploads.upload")}
          </button>
        </div>
      </div>

      {/* Content body */}
      <div
        style={{
          padding: "16px 1.5rem calc(80px + env(safe-area-inset-bottom, 0px))",
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
        }}
      >

      {/* Stats — auto-fit so they wrap nicely on mobile instead of being
          crammed into a hardcoded 4-column grid. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <StatCard
          label="Subiendo"
          value={uploading}
          icon={<Upload size={14} color="var(--color-primary)" />}
          color="var(--color-primary)"
        />
        <StatCard
          label="En cola"
          value={queued}
          icon={<Clock size={14} color="var(--color-text-muted)" />}
          color="var(--color-text-muted)"
        />
        <StatCard
          label="Completados"
          value={done}
          icon={<CheckCircle2 size={14} color="var(--color-success)" />}
          color="var(--color-success)"
        />
        <StatCard
          label="Errores"
          value={errors}
          icon={<XCircle size={14} color="var(--color-danger)" />}
          color="var(--color-danger)"
        />
      </div>

      {/* Active / queued */}
      {active.length > 0 && (
        <Section title={`Activos (${active.length})`}>
          {active.map((item) => (
            <UploadCard
              key={item.id}
              item={item}
              language={language}
              onCancel={onCancel}
              onRetry={onRetry}
              onDelete={onDelete}
            />
          ))}
        </Section>
      )}

      {/* History */}
      {history.length > 0 && (
        <Section
          title={`Historial (${history.length})`}
          action={
            <button
              onClick={onClearCompleted}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                color: "var(--color-text-muted)",
                fontSize: 12,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              <Trash2 size={12} />
              Limpiar
            </button>
          }
        >
          {history.map((item) => (
            <UploadCard
              key={item.id}
              item={item}
              language={language}
              onCancel={onCancel}
              onRetry={onRetry}
              onDelete={onDelete}
            />
          ))}
        </Section>
      )}

      {/* Empty state */}
      {uploads.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "60px 20px",
            color: "var(--color-text-muted)",
          }}
        >
          <Upload size={40} strokeWidth={1} />
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            No hay subidas
          </div>
          <div style={{ fontSize: 13 }}>
            Pulsa "Subir archivos" para añadir archivos a la cola
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <UploadPrepareModal
          ffprobeAvailable={ffprobeAvailable}
          onClose={() => setShowModal(false)}
          onQueued={() => setShowModal(false)}
        />
      )}
      </div>{/* /content body */}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon}
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            fontWeight: 600,
          }}
        >
          {label.toUpperCase()}
        </span>
      </div>
      <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-text-muted)",
            letterSpacing: "0.06em",
            flex: 1,
          }}
        >
          {title.toUpperCase()}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
