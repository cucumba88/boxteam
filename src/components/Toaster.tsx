import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Download, Info, X } from "lucide-react";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import "./ui/ui.css";

/**
 * Single home for every in-app toast.
 *
 * Before this, the download toast and the indexing-error toast were two
 * independently `position: fixed` cards that landed on top of each other (and
 * on top of the mobile bottom tab bar). Now everything renders in one
 * `.ui-toast-stack` column above the status bar / bottom tabs.
 *
 * Fire a toast from anywhere with `pushToast({...})`. The legacy
 * `download:feedback` window event is still understood.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastInput {
  kind: ToastKind;
  title: string;
  /** Bold-ish second line, usually the media title. */
  subject?: string;
  body?: string;
  /** Optional link-style action. */
  action?: { label: string; onClick: () => void };
  /** Toasts with the same group within a few seconds are merged (e.g. "3 descargas añadidas"). */
  group?: string;
}

interface ToastItem extends ToastInput {
  id: number;
  count: number;
  createdAt: number;
}

const TOAST_EVENT = "app:toast";

export function pushToast(toast: ToastInput): void {
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: toast }));
}

/** Long enough to read and reach the action; errors stay a bit longer. */
const DURATION: Record<ToastKind, number> = { success: 5000, info: 5000, error: 8000 };
const MERGE_WINDOW_MS = 4000;
const MAX_VISIBLE = 3;

type DownloadFeedbackDetail = { kind: "success" | "error"; title: string };

function ToastCard({
  toast,
  language,
  onClose,
}: {
  toast: ToastItem;
  language: AppLanguage;
  onClose: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  // Restart the countdown whenever the toast is merged (count changes) and
  // pause it while the pointer or keyboard focus is inside the card.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onClose(toast.id), DURATION[toast.kind]);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.kind, toast.count, onClose]);

  const Icon =
    toast.kind === "error" ? AlertCircle : toast.group === "download" ? Download : toast.kind === "success" ? Check : Info;

  return (
    <div
      className={`ui-toast ui-toast--${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="ui-toast-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <div className="ui-toast-body">
        <div className="ui-toast-title">{toast.title}</div>
        {toast.subject && (
          <div className="ui-toast-subject" title={toast.subject}>
            {toast.subject}
          </div>
        )}
        {toast.body && <div className="ui-toast-text">{toast.body}</div>}
        {toast.action && (
          <div className="ui-toast-actions">
            <button
              type="button"
              className="ui-toast-link"
              onClick={() => {
                toast.action?.onClick();
                onClose(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="ui-toast-close"
        onClick={() => onClose(toast.id)}
        aria-label={t(language, "toast.close")}
        title={t(language, "toast.close")}
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Toaster({
  language,
  onGoToDownloads,
  children,
}: {
  language: AppLanguage;
  onGoToDownloads?: () => void;
  /** Persistent toasts (e.g. the indexing error) rendered at the bottom of the stack. */
  children?: ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const goToDownloads = useRef(onGoToDownloads);
  goToDownloads.current = onGoToDownloads;

  const close = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const add = useCallback((input: ToastInput) => {
    setToasts((current) => {
      const now = Date.now();
      if (input.group) {
        const idx = current.findIndex(
          (x) =>
            x.group === input.group &&
            x.kind === input.kind &&
            now - x.createdAt < MERGE_WINDOW_MS,
        );
        if (idx >= 0) {
          const merged = { ...current[idx], ...input, count: current[idx].count + 1, createdAt: now };
          const next = current.slice();
          next[idx] = merged;
          return next;
        }
      }
      // Same message twice in a row (double click, retry storm): keep one.
      const dup = current.find(
        (x) => x.kind === input.kind && x.title === input.title && x.subject === input.subject,
      );
      if (dup) {
        return current.map((x) => (x.id === dup.id ? { ...x, createdAt: now, count: x.count + 1 } : x));
      }
      return [...current, { ...input, id: nextId.current++, count: 1, createdAt: now }].slice(
        -MAX_VISIBLE,
      );
    });
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      if (detail?.title) add(detail);
    };
    const onDownloadFeedback = (event: Event) => {
      const detail = (event as CustomEvent<DownloadFeedbackDetail>).detail;
      if (!detail?.title) return;
      add({ kind: detail.kind, title: "", subject: detail.title, group: "download" });
    };
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener("download:feedback", onDownloadFeedback);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener("download:feedback", onDownloadFeedback);
    };
  }, [add]);

  // Download toasts get their wording here so merged ones can say "3 descargas".
  const view = (toast: ToastItem): ToastItem => {
    if (toast.group !== "download") return toast;
    if (toast.kind === "error") {
      return {
        ...toast,
        title: t(language, "downloads.toastErrorTitle"),
        body: t(language, "downloads.toastErrorBody"),
      };
    }
    const many = toast.count > 1;
    return {
      ...toast,
      title: many
        ? t(language, "downloads.toastQueuedManyTitle", { count: toast.count })
        : t(language, "downloads.toastQueuedTitle"),
      subject: many ? undefined : toast.subject,
      body: many
        ? t(language, "downloads.toastQueuedManyBody")
        : t(language, "downloads.toastQueuedBody"),
      action: goToDownloads.current
        ? {
            label: t(language, "downloads.toastGoToDownloads"),
            onClick: () => goToDownloads.current?.(),
          }
        : undefined,
    };
  };

  if (toasts.length === 0 && !children) return null;

  return (
    <section className="ui-toast-stack" aria-label={t(language, "toast.region")}>
      {children}
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={view(toast)} language={language} onClose={close} />
      ))}
    </section>
  );
}
