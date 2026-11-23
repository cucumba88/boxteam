import { Download, Sparkles, X } from "lucide-react";
import Button from "../../components/ui/Button";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import {
  dismissUpdate,
  downloadPercent,
  installUpdate,
  useAppUpdate,
} from "./updateStore";
import UpdateProgress from "./UpdateProgress";

/**
 * Persistent card in the <Toaster> stack when a new version is available:
 * one click downloads it, installs it and restarts the app. Closing it hides
 * it for this version; Settings → Sistema still offers the update.
 */
export default function UpdateToast({ language }: { language: AppLanguage }) {
  const update = useAppUpdate();
  const busy = update.status === "downloading" || update.status === "restarting";
  const failed = update.status === "error" && update.version !== null;
  const visible =
    (update.status === "available" && update.dismissedVersion !== update.version) || busy || failed;
  if (!visible || !update.version) return null;

  const percent = downloadPercent(update);
  const text =
    update.status === "restarting"
      ? t(language, "updates.restarting")
      : update.status === "downloading"
        ? percent === null
          ? t(language, "updates.downloading")
          : t(language, "updates.downloadingPercent", { percent })
        : failed
          ? t(language, "updates.installFailed")
          : t(language, "updates.toastBody");

  return (
    <div className={`ui-toast ui-toast--${failed ? "error" : "info"}`} role="status">
      <span className="ui-toast-icon" aria-hidden="true">
        <Sparkles size={16} strokeWidth={2.2} />
      </span>
      <div className="ui-toast-body">
        <div className="ui-toast-title">
          {t(language, "updates.toastTitle", { version: update.version })}
        </div>
        <div className="ui-toast-text">{text}</div>
        {failed && update.error && <div className="ui-toast-detail">{update.error}</div>}
        {busy && <UpdateProgress percent={percent} />}
        {!busy && (
          <div className="ui-toast-actions">
            <Button size="sm" variant="primary" icon={Download} onClick={() => void installUpdate()}>
              {t(language, failed ? "updates.retry" : "updates.install")}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissUpdate}>
              {t(language, "updates.later")}
            </Button>
          </div>
        )}
      </div>
      {!busy && (
        <button
          type="button"
          className="ui-toast-close"
          onClick={dismissUpdate}
          aria-label={t(language, "updates.later")}
          title={t(language, "updates.later")}
        >
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
