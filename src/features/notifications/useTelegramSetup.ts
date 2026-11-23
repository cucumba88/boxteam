import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../../lib/transport";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";

export type SetupStepState = "ok" | "warn" | "error" | "skipped";

export interface SetupStep {
  state: SetupStepState;
  message: string;
}

/** Mirrors `telegram::SetupCheck` in the Rust backend. */
export interface TelegramSetupCheck {
  bot: SetupStep;
  chat: SetupStep;
  admin: SetupStep;
  bot_username: string | null;
  chat_title: string | null;
  chat_kind: string | null;
}

interface DetectedChat {
  id: string;
  title: string;
  kind: string;
}

export type ActionState = "idle" | "running" | "ok" | "error";

/** How long to wait after typing before re-checking automatically. */
const AUTO_CHECK_DELAY_MS = 900;

/**
 * State and Telegram calls for the announcement-bot setup wizard: checks
 * token → bot in chat → admin role, detects the chat id and sends the test
 * messages. The token/chat id themselves live in the Settings form.
 */
export function useTelegramSetup({
  language,
  token,
  chatId,
  setChatId,
}: {
  language: AppLanguage;
  token: string;
  chatId: string;
  setChatId: (chatId: string) => void;
}) {
  const [check, setCheck] = useState<TelegramSetupCheck | null>(null);
  const [checkedKey, setCheckedKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [detectState, setDetectState] = useState<ActionState>("idle");
  const [detectMsg, setDetectMsg] = useState("");
  const [testState, setTestState] = useState<ActionState>("idle");
  const [testMsg, setTestMsg] = useState("");
  const requestRef = useRef(0);

  const key = `${token.trim()}\n${chatId.trim()}`;

  const runCheck = useCallback(async () => {
    const request = ++requestRef.current;
    const currentKey = `${token.trim()}\n${chatId.trim()}`;
    setChecking(true);
    try {
      const result = await call<TelegramSetupCheck>("check_telegram_setup", {
        token: token.trim(),
        chatId: chatId.trim(),
      });
      if (request !== requestRef.current) return;
      setCheck(result);
      setCheckedKey(currentKey);
    } catch (error: unknown) {
      if (request !== requestRef.current) return;
      setCheck({
        bot: { state: "error", message: String(error) },
        chat: { state: "skipped", message: "" },
        admin: { state: "skipped", message: "" },
        bot_username: null,
        chat_title: null,
        chat_kind: null,
      });
      setCheckedKey(currentKey);
    } finally {
      if (request === requestRef.current) setChecking(false);
    }
  }, [token, chatId]);

  // Re-check on its own a moment after the token or chat id changes, so
  // each step ticks green as soon as it's right.
  useEffect(() => {
    if (!token.trim()) {
      requestRef.current += 1;
      setCheck(null);
      setCheckedKey("");
      setChecking(false);
      return;
    }
    if (key === checkedKey) return;
    const timer = window.setTimeout(() => {
      void runCheck();
    }, AUTO_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, checkedKey, token, runCheck]);

  // A test result belongs to the values it was sent with.
  useEffect(() => {
    setTestState("idle");
    setTestMsg("");
  }, [key]);

  const detect = useCallback(async () => {
    setDetectState("running");
    setDetectMsg("");
    try {
      const chat = await call<DetectedChat>("detect_telegram_chat", {
        token: token.trim(),
      });
      setChatId(chat.id);
      setDetectMsg(
        chat.title
          ? t(language, "telegramSetup.detectedNamed", { title: chat.title })
          : t(language, "telegramSetup.detected"),
      );
      setDetectState("ok");
    } catch (error: unknown) {
      setDetectMsg(String(error));
      setDetectState("error");
    }
  }, [language, token, setChatId]);

  const sendTest = useCallback(
    async (kind: "plain" | "sample") => {
      setTestState("running");
      setTestMsg("");
      try {
        const args = { token: token.trim(), chatId: chatId.trim() };
        if (kind === "plain") await call("test_telegram", args);
        else await call("test_telegram_upload_sample", args);
        setTestMsg(
          t(
            language,
            kind === "plain"
              ? "telegramSetup.testSent"
              : "telegramSetup.sampleSent",
          ),
        );
        setTestState("ok");
      } catch (error: unknown) {
        setTestMsg(String(error));
        setTestState("error");
      }
    },
    [language, token, chatId],
  );

  return {
    /** Latest check, or null before the first one. */
    check,
    /** The check matches the current token/chat id (not stale). */
    checkIsCurrent: check !== null && checkedKey === key,
    checking,
    runCheck,
    detect,
    detectState,
    detectMsg,
    sendTest,
    testState,
    testMsg,
  };
}
