import { RefreshCw, Settings, WifiOff, X } from "lucide-react";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { describeIndexError } from "../lib/progressFormat";
import Button from "./ui/Button";

interface IndexErrorToastProps {
  message: string;
  language: AppLanguage;
  onRetry: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * Persistent card shown when a library refresh fails. Lives inside the
 * <Toaster> stack (no own positioning) so it never sits under the download
 * toasts or the mobile tab bar. The backend error is technical English, so we
 * lead with a Spanish sentence the user can act on and keep the raw text as a
 * small "technical detail" line.
 */
export default function IndexErrorToast({
  message,
  language,
  onRetry,
  onOpenSettings,
  onDismiss,
}: IndexErrorToastProps) {
  const { message: friendly, detail } = describeIndexError(language, message);
  return (
    <div className="ui-toast ui-toast--error" role="alert">
      <span className="ui-toast-icon" aria-hidden="true">
        <WifiOff size={16} strokeWidth={2.2} />
      </span>
      <div className="ui-toast-body">
        <div className="ui-toast-title">{t(language, "toast.error.title")}</div>
        <div className="ui-toast-text">{friendly}</div>
        {detail && (
          <div className="ui-toast-detail" title={t(language, "toast.error.details")}>
            {detail}
          </div>
        )}
        <div className="ui-toast-actions">
          <Button
            size="sm"
            variant="danger"
            icon={RefreshCw}
            onClick={() => {
              // The hook clears the error on index:start and re-shows it if
              // the new run fails too.
              onDismiss();
              onRetry();
            }}
          >
            {t(language, "toast.error.retry")}
          </Button>
          <Button size="sm" variant="ghost" icon={Settings} onClick={onOpenSettings}>
            {t(language, "library.openSettings")}
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="ui-toast-close"
        onClick={onDismiss}
        aria-label={t(language, "toast.error.dismiss")}
        title={t(language, "toast.error.dismiss")}
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
