import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, Send, Settings as SettingsIcon, X } from "lucide-react";
import Button from "../../components/ui/Button";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";

type MessageKey = Parameters<typeof t>[1];

/** Steps of the announcement-bot setup, in order. Mirrors Settings →
 * Notificaciones → Canal de anuncios (token, Detectar, ejemplo de subida). */
const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "telegramGuide.step1Title", body: "telegramGuide.step1Body" },
  { title: "telegramGuide.step2Title", body: "telegramGuide.step2Body" },
  { title: "telegramGuide.step3Title", body: "telegramGuide.step3Body" },
  { title: "telegramGuide.step4Title", body: "telegramGuide.step4Body" },
  { title: "telegramGuide.step5Title", body: "telegramGuide.step5Body" },
  { title: "telegramGuide.step6Title", body: "telegramGuide.step6Body" },
];

const TIPS: MessageKey[] = [
  "telegramGuide.tipBatch",
  "telegramGuide.tipDisable",
  "telegramGuide.tipWebhook",
  "telegramGuide.tipPersonal",
];

/**
 * Step-by-step help for the upload-announcement Telegram bot. Shown only to
 * users who can upload (the Uploads tab and the Settings help box are both
 * gated on the FTP write probe).
 */
export function TelegramBotGuide({
  language,
  showIntro = true,
}: {
  language: AppLanguage;
  showIntro?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {showIntro && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--color-text-muted)",
          }}
        >
          {t(language, "telegramGuide.intro")}
        </p>
      )}
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {STEPS.map((step, i) => (
          <li key={step.title} style={{ display: "flex", gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-primary)",
                background:
                  "color-mix(in srgb, var(--color-primary) 16%, transparent)",
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text)",
                  marginBottom: 2,
                }}
              >
                {t(language, step.title)}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--color-text-muted)",
                  overflowWrap: "anywhere",
                }}
              >
                {t(language, step.body)}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div
        style={{
          borderRadius: "var(--radius)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 74%, transparent)",
          background: "color-mix(in srgb, var(--color-bg) 70%, transparent)",
          padding: "0.7rem 0.9rem",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-text)",
          }}
        >
          <Lightbulb size={14} aria-hidden="true" />
          {t(language, "telegramGuide.tipsTitle")}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-text-muted)",
          }}
        >
          {TIPS.map((tip) => (
            <li key={tip}>{t(language, tip)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The guide in a dialog, opened from the Uploads tab. */
export default function TelegramGuideDialog({
  open,
  language,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  language: AppLanguage;
  onClose: () => void;
  /** Jumps to Settings → Notificaciones → Canal de anuncios. */
  onOpenSettings?: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "20px 20px 14px",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
              background:
                "color-mix(in srgb, var(--color-primary) 16%, transparent)",
              flexShrink: 0,
            }}
          >
            <Send size={18} strokeWidth={2.1} aria-hidden="true" />
          </div>
          <h2
            id={titleId}
            style={{
              margin: 0,
              flex: 1,
              minWidth: 0,
              fontSize: 17,
              fontWeight: 700,
              color: "var(--color-text)",
            }}
          >
            {t(language, "telegramGuide.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t(language, "common.close")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 8,
              color: "var(--color-text-muted)",
              display: "flex",
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div style={{ padding: "0 20px", overflowY: "auto", flex: 1 }}>
          <TelegramBotGuide language={language} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
            padding: "16px 20px 20px",
          }}
        >
          <Button variant="ghost" onClick={onClose}>
            {t(language, "common.close")}
          </Button>
          {onOpenSettings && (
            <Button variant="primary" icon={SettingsIcon} onClick={onOpenSettings}>
              {t(language, "telegramGuide.openSettings")}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
