import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppIcon from "../AppIcon";
import ApiKeysGuideLink, { openExternal } from "../ApiKeysGuideLink";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import type { WizardConfig } from "./types";
import {
  WizardFooter,
  WizardStatusPill,
  wizardField,
  wizardGhostBtn,
  wizardInput,
  wizardLabel,
  wizardSectionCard,
  wizardSubtext,
} from "./wizardUi";

const TMDB_API_URL = "https://www.themoviedb.org/settings/api";

export default function StepTMDB({
  defaults,
  language,
  onNext,
  onBack,
}: {
  defaults: WizardConfig;
  language: AppLanguage;
  onNext: (p: Partial<WizardConfig>) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = useState(defaults.tmdb_api_key);
  const [defaultLanguage, setDefaultLanguage] = useState<"es" | "en">(
    defaults.default_language,
  );
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">(
    defaults.tmdb_api_key ? "ok" : "idle",
  );

  const test = async () => {
    setStatus("testing");
    const ok = await invoke<boolean>("test_tmdb_key", {
      apiKey: apiKey.trim(),
    }).catch(() => false);
    setStatus(ok ? "ok" : "error");
  };

  const next = () =>
    onNext({ tmdb_api_key: apiKey.trim(), default_language: defaultLanguage });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (status === "ok") next();
        else if (apiKey.trim() && status !== "testing") void test();
      }}
      style={{ display: "grid", gap: 16 }}
    >
      <section style={wizardSectionCard}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={wizardField}>
            <label style={wizardLabel} htmlFor="wiz-tmdb-key">
              {t(language, "wizard.tmdbKey")}
            </label>
            <input
              id="wiz-tmdb-key"
              style={{ ...wizardInput, fontFamily: "var(--font-mono, monospace)" }}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setStatus("idle");
              }}
              placeholder={t(language, "settings.tmdbPlaceholder")}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <span style={wizardSubtext}>
              {t(language, "wizard.tmdbHelp")}{" "}
              <button
                type="button"
                onClick={() => openExternal(TMDB_API_URL)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                themoviedb.org
              </button>
              {" · "}
              <ApiKeysGuideLink language={language} />
            </span>
          </div>

          <div style={wizardField}>
            <label style={wizardLabel} htmlFor="wiz-tmdb-lang">
              {t(language, "settings.defaultLanguage")}
            </label>
            <select
              id="wiz-tmdb-lang"
              style={wizardInput}
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value as "es" | "en")}
            >
              <option value="es">{t(language, "common.languageSpanish")}</option>
              <option value="en">{t(language, "common.languageEnglish")}</option>
            </select>
            <span style={wizardSubtext}>
              {t(language, "settings.defaultLanguageHelp")}
            </span>
          </div>
        </div>
      </section>

      <WizardFooter
        language={language}
        onBack={onBack}
        nextType="submit"
        nextDisabled={status !== "ok"}
        extra={
          <>
            <button
              type="button"
              style={wizardGhostBtn(status === "testing" || !apiKey.trim())}
              onClick={test}
              disabled={status === "testing" || !apiKey.trim()}
            >
              <AppIcon name="search" size={15} strokeWidth={2.2} />
              {status === "testing"
                ? t(language, "wizard.validating")
                : t(language, "wizard.validateKey")}
            </button>
            {status === "ok" && (
              <WizardStatusPill tone="success">
                {t(language, "wizard.validKey")}
              </WizardStatusPill>
            )}
            {status === "error" && (
              <WizardStatusPill tone="danger">
                {t(language, "wizard.invalidKey")}
              </WizardStatusPill>
            )}
          </>
        }
      />
    </form>
  );
}
