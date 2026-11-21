import { Clock, RefreshCw, Trash2, X } from "lucide-react";
import type { UploadItem } from "./types";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import { formatBytes, formatResolution } from "../../lib/format";
import {
  audioLabel,
  hdrShortLabel,
  isNotableHdr,
  isPremiumAudio,
} from "../../utils/techTags";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  TransferCard,
  TransferError,
  TransferMeta,
  TransferNote,
  TransferProgress,
  formatElapsed,
  type TransferStatus,
} from "../transfers/TransferUI";

const TO_TRANSFER_STATUS: Record<UploadItem["status"], TransferStatus> = {
  queued: "queued",
  uploading: "active",
  done: "done",
  error: "error",
  cancelled: "cancelled",
};

interface UploadCardProps {
  item: UploadItem;
  language: AppLanguage;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  onDelete: (id: number, deleteRemote?: boolean) => void;
}

export default function UploadCard({
  item,
  language,
  onCancel,
  onRetry,
  onDelete,
}: UploadCardProps) {
  const es = language === "es";
  const pct =
    item.bytes_total > 0
      ? Math.min(100, Math.round((item.bytes_done / item.bytes_total) * 100))
      : 0;
  const finished =
    item.status === "done" ||
    item.status === "error" ||
    item.status === "cancelled";
  const elapsedMs =
    item.started_at_ms && item.completed_at_ms
      ? item.completed_at_ms - item.started_at_ms
      : 0;
  const retrying =
    item.status === "uploading" &&
    (item.attempt ?? 0) > 0 &&
    (item.max_attempts ?? 0) > 1;

  return (
    <TransferCard
      status={TO_TRANSFER_STATUS[item.status]}
      statusLabel={t(language, `upload.status.${item.status}` as never)}
      title={item.media_title ?? item.filename}
      subtitle={item.media_title ? item.filename : undefined}
      extraBadge={
        retrying ? (
          <StatusBadge tone="warning" icon={RefreshCw} title={item.error ?? undefined}>
            {es ? "Reintento" : "Retry"} {(item.attempt ?? 0) + 1}/{item.max_attempts}
          </StatusBadge>
        ) : undefined
      }
      actions={
        <>
          {(item.status === "queued" || item.status === "uploading") && (
            <Button size="sm" variant="danger" icon={X} onClick={() => onCancel(item.id)}>
              {t(language, "upload.cancel")}
            </Button>
          )}
          {(item.status === "error" || item.status === "cancelled") && (
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => onRetry(item.id)}>
              {t(language, "upload.retry")}
            </Button>
          )}
          {/* Removing an entry from the list and deleting the uploaded file
              from the server are different intents. */}
          {finished && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => onDelete(item.id, false)}>
              {item.status === "error" && item.bytes_done > 0
                ? es
                  ? "Descartar (borra el archivo a medias)"
                  : "Discard (deletes the partial file)"
                : es
                  ? "Quitar de la lista"
                  : "Remove from list"}
            </Button>
          )}
          {item.status === "done" && (
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={() => {
                if (
                  window.confirm(
                    es
                      ? `¿Borrar "${item.filename}" del servidor FTP? No se puede deshacer.`
                      : `Delete "${item.filename}" from the FTP server? This can't be undone.`,
                  )
                )
                  onDelete(item.id, true);
              }}
            >
              {es ? "Borrar del servidor" : "Delete from server"}
            </Button>
          )}
        </>
      }
    >
      {/* What is being uploaded — the tags that end up in the library. */}
      <TransferMeta
        items={[
          !!item.resolution && { key: "res", label: formatResolution(item.resolution) },
          !!item.hdr && isNotableHdr(item.hdr) && {
            key: "hdr",
            label: hdrShortLabel(item.hdr),
            accent: true,
          },
          !!item.audio_codec && {
            key: "audio",
            label: audioLabel(item.audio_codec),
            accent: isPremiumAudio(item.audio_codec),
          },
          finished && item.bytes_total > 0 && {
            key: "size",
            label: formatBytes(item.bytes_total),
          },
          finished && elapsedMs > 1000 && { key: "time", label: formatElapsed(elapsedMs) },
          item.status === "error" &&
            item.bytes_done > 0 &&
            item.bytes_total > 0 && {
              key: "resume",
              label: es
                ? `Llegó al ${pct} % · al reintentar sigue desde ahí`
                : `Reached ${pct}% · retry resumes from there`,
            },
        ]}
      />
      {item.status === "uploading" && (
        <TransferProgress
          language={language}
          done={item.bytes_done}
          total={item.bytes_total}
          speedBps={item.speed_bps}
          direction="up"
        />
      )}
      {item.status === "queued" && (
        <TransferNote
          icon={Clock}
          text={
            item.bytes_done > 0 && item.bytes_total > 0
              ? es
                ? `En cola · seguirá desde ${formatBytes(item.bytes_done)} (${pct} %)`
                : `Queued · will resume from ${formatBytes(item.bytes_done)} (${pct}%)`
              : es
                ? "Esperando en cola…"
                : "Waiting in queue…"
          }
        />
      )}
      {item.error && finished && <TransferError message={item.error} />}
    </TransferCard>
  );
}
