import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  Send,
  X,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { formInputStandard } from "../../lib/formStyles";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import {
  useTelegramSetup,
  type ActionState,
  type SetupStep,
} from "./useTelegramSetup";

type StepVisual = "done" | "warn" | "error" | "checking" | "todo";

interface TelegramSetupWizardProps {
  language: AppLanguage;
  token: string;
  chatId: string;
  onTokenChange: (token: string) => void;
  onChatIdChange: (chatId: string) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
};

const VISUAL_COLOR: Record<StepVisual, string> = {
  done: "var(--color-success)",
  warn: "var(--color-warning)",
  error: "var(--color-danger)",
  checking: "var(--color-primary)",
  todo: "var(--color-text-muted)",
};

function visualFor(step: SetupStep | undefined, stale: boolean): StepVisual {
  if (!step || stale) return stale ? "checking" : "todo";
  switch (step.state) {
    case "ok":
      return "done";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return "todo";
  }
}

function visualForAction(state: ActionState): StepVisual {
  if (state === "ok") return "done";
  if (state === "error") return "error";
  if (state === "running") return "checking";
  return "todo";
}

function StepBadge({ index, visual }: { index: number; visual: StepVisual }) {
  const color = VISUAL_COLOR[visual];
  const filled = visual === "done" || visual === "warn" || visual === "error";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12.5,
        fontWeight: 700,
        color: filled ? "var(--color-bg)" : color,
        background: filled
          ? color
          : `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1.5px solid ${color}`,
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      {visual === "done" ? (
        <Check size={15} strokeWidth={3} />
      ) : visual === "warn" ? (
        <AlertTriangle size={14} strokeWidth={2.6} />
      ) : visual === "error" ? (
        <X size={15} strokeWidth={3} />
      ) : visual === "checking" ? (
        <LoaderCircle
          size={15}
          strokeWidth={2.6}
          style={{ animation: "spin 1.1s linear infinite" }}
        />
      ) : (
        index
      )}
    </span>
  );
}

function StatusLine({ visual, text }: { visual: StepVisual; text: string }) {
  if (!text) return null;
  return (
    <div
      role="status"
      style={{
        fontSize: 12.5,
        lineHeight: 1.5,
        fontWeight: visual === "todo" ? 400 : 600,
        color:
          visual === "todo" || visual === "checking"
            ? "var(--color-text-muted)"
            : VISUAL_COLOR[visual],
      }}
    >
      {text}
    </div>
  );
}

function WizardStep({
  index,
  visual,
  title,
  hint,
  status,
  last = false,
  children,
}: {
  index: number;
  visual: StepVisual;
  title: string;
  hint: string;
  status: string;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li style={{ display: "flex", gap: 14 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <StepBadge index={index} visual={visual} />
        {!last && (
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              width: 2,
              marginTop: 4,
              borderRadius: 2,
              background:
                visual === "done"
                  ? "color-mix(in srgb, var(--color-success) 55%, transparent)"
                  : "color-mix(in srgb, var(--color-border) 90%, transparent)",
            }}
          />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: last ? 0 : 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text)",
              lineHeight: "28px",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--color-text-muted)",
            }}
          >
            {hint}
          </div>
        </div>
        {children}
        <StatusLine visual={visual} text={status} />
      </div>
    </li>
  );
}

/**
 * Guided setup of the upload-announcement bot: token → bot in the group or
 * channel → admin rights → test message, each with its own live check.
 */
export default function TelegramSetupWizard({
  language,
  token,
  chatId,
  onTokenChange,
  onChatIdChange,
}: TelegramSetupWizardProps) {
  const setup = useTelegramSetup({
    language,
    token,
    chatId,
    setChatId: onChatIdChange,
  });
  const { check, checkIsCurrent, checking } = setup;
  const stale = checking || (check !== null && !checkIsCurrent);
  const hasToken = token.trim().length > 0;
  const hasChat = chatId.trim().length > 0;

  const botVisual = hasToken ? visualFor(check?.bot, stale) : "todo";
  const chatVisual =
    setup.detectState === "running"
      ? "checking"
      : hasToken && hasChat
        ? visualFor(check?.chat, stale)
        : "todo";
  const adminVisual =
    hasToken && hasChat ? visualFor(check?.admin, stale) : "todo";
  const readyToTest =
    hasToken &&
    hasChat &&
    checkIsCurrent &&
    check?.bot.state === "ok" &&
    check.chat.state === "ok" &&
    check.admin.state !== "error";
  const testVisual = visualForAction(setup.testState);

  const stepStatus = (step: SetupStep | undefined, visual: StepVisual) =>
    visual === "checking"
      ? t(language, "telegramSetup.checking")
      : visual === "todo"
        ? ""
        : (step?.message ?? "");

  const chatStatus =
    setup.detectState === "running"
      ? t(language, "telegramSetup.detecting")
      : setup.detectState === "error"
        ? setup.detectMsg
        : stepStatus(check?.chat, chatVisual) ||
          (setup.detectState === "ok" ? setup.detectMsg : "");

  const allDone =
    botVisual === "done" &&
    chatVisual === "done" &&
    (adminVisual === "done" || adminVisual === "warn") &&
    testVisual === "done";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        <WizardStep
          index={1}
          visual={botVisual}
          title={t(language, "telegramSetup.step1Title")}
          hint={t(language, "telegramSetup.step1Hint")}
          status={stepStatus(check?.bot, botVisual)}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>{t(language, "telegramSetup.tokenLabel")}</span>
            <input
              style={formInputStandard}
              type="password"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="1234567890:ABCdef..."
              autoComplete="off"
            />
          </label>
        </WizardStep>

        <WizardStep
          index={2}
          visual={chatVisual}
          title={t(language, "telegramSetup.step2Title")}
          hint={t(language, "telegramSetup.step2Hint")}
          status={chatStatus}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>{t(language, "telegramSetup.chatLabel")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...formInputStandard, flex: 1, minWidth: 0 }}
                value={chatId}
                onChange={(event) => onChatIdChange(event.target.value)}
                placeholder="-1001234567890"
                inputMode="numeric"
              />
              <Button
                type="button"
                icon={ScanSearch}
                onClick={() => void setup.detect()}
                disabled={!hasToken || setup.detectState === "running"}
                title={t(language, "telegramSetup.detectTitle")}
              >
                {t(language, "telegramSetup.detect")}
              </Button>
            </div>
          </label>
        </WizardStep>

        <WizardStep
          index={3}
          visual={adminVisual}
          title={t(language, "telegramSetup.step3Title")}
          hint={t(language, "telegramSetup.step3Hint")}
          status={stepStatus(check?.admin, adminVisual)}
        />

        <WizardStep
          index={4}
          last
          visual={testVisual}
          title={t(language, "telegramSetup.step4Title")}
          hint={t(language, "telegramSetup.step4Hint")}
          status={
            setup.testState === "running"
              ? t(language, "telegramSetup.sending")
              : setup.testMsg
          }
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant={readyToTest ? "primary" : "secondary"}
              icon={Send}
              onClick={() => void setup.sendTest("plain")}
              disabled={!hasToken || !hasChat || setup.testState === "running"}
            >
              {t(language, "telegramSetup.sendTest")}
            </Button>
            <Button
              type="button"
              onClick={() => void setup.sendTest("sample")}
              disabled={!hasToken || !hasChat || setup.testState === "running"}
              title={t(language, "telegramSetup.sendSampleTitle")}
            >
              {t(language, "telegramSetup.sendSample")}
            </Button>
          </div>
        </WizardStep>
      </ol>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 12,
          borderTop:
            "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            color: allDone ? "var(--color-success)" : "var(--color-text-muted)",
            fontWeight: allDone ? 600 : 400,
          }}
        >
          {allDone
            ? t(language, "telegramSetup.allDone")
            : t(language, "telegramSetup.footer")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          onClick={() => void setup.runCheck()}
          disabled={!hasToken || checking}
        >
          {t(language, "telegramSetup.recheck")}
        </Button>
      </div>
    </div>
  );
}
