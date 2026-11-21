import { useState } from "react";
import {
  Check,
  Clock,
  Download,
  Folder,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { DownloadItem } from "../hooks/useDownloads";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { isTauri } from "../lib/transport";
import { formatBytes } from "../lib/format";
import Button from "./ui/Button";
import {
  TransferBody,
  TransferCard,
  TransferEmpty,
  TransferEmptySection,
  TransferError,
  TransferFilterChips,
  TransferMeta,
  TransferNote,
  TransferProgress,
  TransferSection,
  TransferStats,
  TransferToolbar,
  formatElapsed,
  formatSpeed,
  type TransferStatus,
} from "../features/transfers/TransferUI";

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return "…/" + parts.slice(-2).join("/");
}

const TO_TRANSFER_STATUS: Record<DownloadItem["status"], TransferStatus> = {
  queued: "queued",
  downloading: "active",
  done: "done",
  error: "error",
  cancelled: "cancelled",
};

function DownloadRow({
  item,
  language,
  onCancel,
  onRetry,
  onOpenFolder,
  onDelete,
}: {
  item: DownloadItem;
  language: AppLanguage;
  onCancel: () => void;
  onRetry: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}) {
  const isActive = item.status === "queued" || item.status === "downloading";
  const canRetry = item.status === "error" || item.status === "cancelled";
  const isDone = item.status === "done";
  const canOpenFolder = isDone && isTauri();
  const finished = isDone || canRetry;
  const elapsed =
    item.started_at_ms && (item.completed_at_ms || isDone)
      ? (item.completed_at_ms ?? Date.now()) - item.started_at_ms
      : 0;

  return (
    <TransferCard
      status={TO_TRANSFER_STATUS[item.status]}
      statusLabel={t(language, `downloads.${item.status}` as never)}
      title={item.media_title ?? item.filename}
      subtitle={item.media_title ? item.filename : undefined}
      actions={
        <>
          {isActive && (
            <Button size="sm" variant="danger" icon={X} onClick={onCancel}>
              {t(language, "downloads.cancel")}
            </Button>
          )}
          {canRetry && (
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry}>
              {t(language, "downloads.retry")}
            </Button>
          )}
          {canOpenFolder && (
            <Button size="sm" variant="secondary" icon={Folder} onClick={onOpenFolder}>
              {t(language, "downloads.openFolder")}
            </Button>
          )}
          {finished && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>
              {t(language, "downloads.delete")}
            </Button>
          )}
        </>
      }
    >
      {item.status === "downloading" && (
        <TransferProgress
          language={language}
          done={item.bytes_done}
          total={item.bytes_total}
          speedBps={item.speed_bps}
          direction="down"
        />
      )}
      {item.status === "queued" && (
        <TransferNote icon={Clock} text={t(language, "downloads.waiting")} />
      )}
      {finished && (
        <TransferMeta
          items={[
            item.bytes_total > 0 && {
              key: "size",
              label: formatBytes(item.bytes_total),
            },
            elapsed > 1000 && { key: "time", label: formatElapsed(elapsed) },
            !!item.local_path && {
              key: "path",
              label: shortPath(item.local_path),
              title: item.local_path,
            },
          ]}
        />
      )}
      {item.status === "error" && item.error && (
        <TransferError message={item.error} />
      )}
    </TransferCard>
  );
}

type Filter = "all" | "active" | "queued" | "done" | "failed";

export default function DownloadsTab({
  language,
  downloads,
  cancelDownload,
  clearCompleted,
  retryDownload,
  openDownloadFolder,
  deleteDownload,
}: {
  language: AppLanguage;
  downloads: DownloadItem[];
  cancelDownload: (id: number) => Promise<unknown>;
  clearCompleted: () => Promise<unknown>;
  retryDownload: (id: number) => Promise<unknown>;
  openDownloadFolder: (localPath: string) => Promise<unknown>;
  deleteDownload: (id: number) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const es = language === "es";

  const activeDownloads = [...downloads]
    .filter((item) => item.status === "queued" || item.status === "downloading")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "downloading" ? -1 : 1;
      return (
        (b.started_at_ms ?? b.added_at_ms ?? 0) -
        (a.started_at_ms ?? a.added_at_ms ?? 0)
      );
    });

  const historyDownloads = [...downloads]
    .filter((item) => item.status !== "queued" && item.status !== "downloading")
    .sort(
      (a, b) =>
        (b.completed_at_ms ?? b.added_at_ms ?? 0) -
        (a.completed_at_ms ?? a.added_at_ms ?? 0),
    );

  const downloading = activeDownloads.filter((i) => i.status === "downloading").length;
  const queued = activeDownloads.filter((i) => i.status === "queued").length;
  const done = historyDownloads.filter((i) => i.status === "done").length;
  const errors = historyDownloads.filter((i) => i.status === "error").length;
  const totalSpeed = activeDownloads
    .filter((i) => i.status === "downloading")
    .reduce((sum, i) => sum + (i.speed_bps ?? 0), 0);

  const filteredActive =
    filter === "all" || filter === "active"
      ? activeDownloads
      : filter === "queued"
        ? activeDownloads.filter((d) => d.status === "queued")
        : [];
  const filteredHistory =
    filter === "all"
      ? historyDownloads
      : filter === "done"
        ? historyDownloads.filter((d) => d.status === "done")
        : filter === "failed"
          ? historyDownloads.filter((d) => d.status === "error")
          : [];

  const renderRow = (item: DownloadItem) => (
    <DownloadRow
      key={item.id}
      item={item}
      language={language}
      onCancel={() => void cancelDownload(item.id)}
      onRetry={() => void retryDownload(item.id)}
      onOpenFolder={() => void openDownloadFolder(item.local_path)}
      onDelete={() => void deleteDownload(item.id)}
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
          <TransferFilterChips
            active={filter}
            onChange={setFilter}
            chips={[
              { id: "all", label: es ? "Todo" : "All", count: downloads.length },
              { id: "active", label: es ? "Activas" : "Active", count: downloading + queued },
              { id: "queued", label: es ? "En cola" : "Queued", count: queued },
              { id: "done", label: es ? "Completadas" : "Done", count: done },
              { id: "failed", label: es ? "Con error" : "Failed", count: errors },
            ]}
          />
        }
        right={
          totalSpeed > 0 ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-primary)",
                whiteSpace: "nowrap",
              }}
            >
              ↓ {formatSpeed(totalSpeed)}
            </span>
          ) : undefined
        }
      />

      <TransferBody>
        <TransferStats
          stats={[
            { icon: Loader2, label: es ? "Descargando" : "Downloading", value: downloading, tone: "primary" },
            { icon: Clock, label: es ? "En cola" : "Queued", value: queued, tone: "neutral" },
            { icon: Check, label: es ? "Completadas" : "Done", value: done, tone: "success" },
            { icon: X, label: es ? "Con error" : "Failed", value: errors, tone: "danger" },
          ]}
        />

        {downloads.length === 0 ? (
          <TransferEmpty
            icon={Download}
            title={t(language, "downloads.emptyTitle")}
            body={t(language, "downloads.emptyBody")}
          />
        ) : (
          <>
            <TransferSection
              title={t(language, "downloads.activeSection")}
              count={filteredActive.length}
            >
              {filteredActive.length > 0 ? (
                filteredActive.map(renderRow)
              ) : (
                <TransferEmptySection icon={Clock} text={t(language, "downloads.noActive")} />
              )}
            </TransferSection>

            <TransferSection
              title={t(language, "downloads.historySection")}
              count={filteredHistory.length}
              action={
                historyDownloads.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => void clearCompleted()}
                  >
                    {t(language, "downloads.clearCompleted")}
                  </Button>
                ) : undefined
              }
            >
              {filteredHistory.length > 0 ? (
                filteredHistory.map(renderRow)
              ) : (
                <TransferEmptySection icon={Check} text={t(language, "downloads.noHistory")} />
              )}
            </TransferSection>
          </>
        )}
      </TransferBody>
    </div>
  );
}
