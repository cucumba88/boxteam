import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  TransferBody,
  TransferEmpty,
  TransferEmptySection,
  TransferFilterChips,
  TransferSection,
  TransferStats,
  TransferToolbar,
} from "../transfers/TransferUI";
import UploadCard from "./UploadCard";
import UploadPrepareModal from "./UploadPrepareModal";
import type { UploadItem } from "./types";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";

interface UploadsTabProps {
  uploads: UploadItem[];
  language: AppLanguage;
  /** Result of the FTP write probe done by the library (null = checking). */
  writeOk: boolean | null;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  onRetryGroup?: (groupId: string) => Promise<unknown>;
  onRetryAllFailed?: () => Promise<unknown>;
  onDelete: (id: number, deleteRemote?: boolean) => void;
  onClearCompleted: () => void;
}

export default function UploadsTab({
  uploads,
  language,
  writeOk,
  onCancel,
  onRetry,
  onRetryGroup,
  onRetryAllFailed,
  onDelete,
  onClearCompleted,
}: UploadsTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [ffprobeAvailable, setFfprobeAvailable] = useState(false);
  const checkingWrite = writeOk === null;

  useEffect(() => {
    invoke<string | null>("check_ffprobe")
      .then((p) => setFfprobeAvailable(p != null))
      .catch(() => setFfprobeAvailable(false));

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

  const es = language === "es";
  type Filter = "all" | "active" | "queued" | "done" | "failed";
  const [filter, setFilter] = useState<Filter>("all");
  const filteredActive =
    filter === "all" || filter === "active"
      ? active
      : filter === "queued"
        ? active.filter((u) => u.status === "queued")
        : [];
  const filteredHistory =
    filter === "all"
      ? history
      : filter === "done"
        ? history.filter((u) => u.status === "done")
        : filter === "failed"
          ? history.filter((u) => u.status === "error")
          : [];
  const uploadBlocked = !checkingWrite && writeOk === false;

  const renderCard = (item: UploadItem) => (
    <UploadCard
      key={item.id}
      item={item}
      language={language}
      onCancel={onCancel}
      onRetry={onRetry}
      onDelete={onDelete}
    />
  );

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TransferToolbar
        left={
          <>
            <TransferFilterChips
              active={filter}
              onChange={setFilter}
              chips={[
                { id: "all", label: es ? "Todo" : "All", count: uploads.length },
                { id: "active", label: es ? "Activas" : "Active", count: uploading + queued },
                { id: "queued", label: es ? "En cola" : "Queued", count: queued },
                { id: "done", label: es ? "Completadas" : "Done", count: done },
                { id: "failed", label: es ? "Con error" : "Failed", count: errors },
              ]}
            />
            {uploadBlocked && (
              <StatusBadge tone="danger" icon={AlertTriangle}>
                {t(language, "uploads.noFtpWrite")}
              </StatusBadge>
            )}
          </>
        }
        right={
          <>
            {errors > 0 && onRetryAllFailed && (
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => void onRetryAllFailed()}
              >
                {es ? `Reintentar fallidas (${errors})` : `Retry failed (${errors})`}
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              icon={Upload}
              disabled={uploadBlocked}
              onClick={() => setShowModal(true)}
            >
              {t(language, "uploads.upload")}
            </Button>
          </>
        }
      />

      <TransferBody>
        <TransferStats
          stats={[
            { icon: Loader2, label: es ? "Subiendo" : "Uploading", value: uploading, tone: "primary" },
            { icon: Clock, label: es ? "En cola" : "Queued", value: queued, tone: "neutral" },
            { icon: Check, label: es ? "Completadas" : "Done", value: done, tone: "success" },
            { icon: X, label: es ? "Con error" : "Failed", value: errors, tone: "danger" },
          ]}
        />

        {uploads.length === 0 ? (
          <TransferEmpty
            icon={Upload}
            title={t(language, "upload.noUploads")}
            body={
              es
                ? "Pulsa «Subir archivos» para añadir archivos a la cola."
                : "Press “Upload files” to add files to the queue."
            }
            action={
              <Button
                variant="primary"
                icon={Upload}
                disabled={uploadBlocked}
                onClick={() => setShowModal(true)}
              >
                {t(language, "uploads.upload")}
              </Button>
            }
          />
        ) : (
          <>
            {(filter === "all" || filter === "active" || filter === "queued") && (
            <TransferSection
              title={t(language, "upload.active")}
              count={filteredActive.length}
            >
              {filteredActive.length > 0 ? (
                filteredActive.map(renderCard)
              ) : (
                <TransferEmptySection
                  icon={Clock}
                  text={es ? "No hay subidas en curso ahora mismo." : "No uploads in progress right now."}
                />
              )}
            </TransferSection>
            )}

            {(filter === "all" || filter === "done" || filter === "failed") && (
            <TransferSection
              title={t(language, "upload.history")}
              count={filteredHistory.length}
              action={
                history.length > 0 ? (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={onClearCompleted}>
                    {t(language, "upload.clearCompleted")}
                  </Button>
                ) : undefined
              }
            >
              {filteredHistory.length === 0 ? (
                <TransferEmptySection
                  icon={Check}
                  text={es ? "Todavía no hay historial de subidas." : "No upload history yet."}
                />
              ) : (
                (() => {
                  // Build groups in insertion order: each unique group_id keeps
                  // the position of its first-encountered item; ungrouped items
                  // render as singletons in their original position.
                  type Group = { groupId: string | null; items: UploadItem[] };
                  const groups: Group[] = [];
                  const byId = new Map<string, Group>();
                  for (const item of filteredHistory) {
                    const gid = item.group_id ?? null;
                    if (gid) {
                      let g = byId.get(gid);
                      if (!g) {
                        g = { groupId: gid, items: [] };
                        byId.set(gid, g);
                        groups.push(g);
                      }
                      g.items.push(item);
                    } else {
                      groups.push({ groupId: null, items: [item] });
                    }
                  }
                  return groups.map((g) => {
                    if (g.groupId === null) return renderCard(g.items[0]);
                    const errCount = g.items.filter((i) => i.status === "error").length;
                    const firstTitle =
                      g.items[0]?.media_title ?? g.items[0]?.filename ?? "";
                    return (
                      <div
                        key={g.groupId}
                        style={{ display: "flex", flexDirection: "column", gap: 8 }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12.5,
                            color: "var(--color-text-muted)",
                          }}
                        >
                          <span
                            title={firstTitle}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <strong style={{ color: "var(--color-text)" }}>{firstTitle}</strong>
                            {" · "}
                            {es ? `${g.items.length} episodios` : `${g.items.length} episodes`}
                          </span>
                          {errCount > 0 && (
                            <StatusBadge tone="warning" icon={AlertTriangle}>
                              {es ? `${errCount} con error` : `${errCount} failed`}
                            </StatusBadge>
                          )}
                          {errCount > 0 && onRetryGroup && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={RefreshCw}
                              onClick={() => void onRetryGroup(g.groupId!)}
                            >
                              {es ? "Reintentar fallidas" : "Retry failed"}
                            </Button>
                          )}
                        </div>
                        {g.items.map(renderCard)}
                      </div>
                    );
                  });
                })()
              )}
            </TransferSection>
            )}
          </>
        )}

        {showModal && (
          <UploadPrepareModal
            ffprobeAvailable={ffprobeAvailable}
            onClose={() => setShowModal(false)}
            onQueued={() => setShowModal(false)}
          />
        )}
      </TransferBody>
    </div>
  );
}
