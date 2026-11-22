import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppIcon from "../AppIcon";
import FtpTlsFields from "../FtpTlsFields";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import type { WizardConfig } from "./types";
import {
  WizardFooter,
  WizardStatusPill,
  friendlyFtpError,
  wizardField,
  wizardGhostBtn,
  wizardInput,
  wizardLabel,
  wizardSectionCard,
  wizardSubtext,
} from "./wizardUi";

type FtpFields = Pick<
  WizardConfig,
  | "ftp_host"
  | "ftp_port"
  | "ftp_user"
  | "ftp_pass"
  | "ftp_root"
  | "ftp_tls"
  | "ftp_tls_accept_invalid_certs"
>;

const responsivePairGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

export default function StepFTP({
  defaults,
  language,
  onNext,
  onBack,
  transitioning = false,
}: {
  defaults: WizardConfig;
  language: AppLanguage;
  onNext: (p: Partial<WizardConfig>) => void;
  onBack: () => void;
  transitioning?: boolean;
}) {
  const [form, setForm] = useState<FtpFields>({
    ftp_host: defaults.ftp_host,
    ftp_port: defaults.ftp_port,
    ftp_user: defaults.ftp_user,
    ftp_pass: defaults.ftp_pass,
    ftp_root: defaults.ftp_root,
    ftp_tls: defaults.ftp_tls,
    ftp_tls_accept_invalid_certs: defaults.ftp_tls_accept_invalid_certs,
  });
  const [status, setStatus] = useState<
    "idle" | "testing" | "ok" | "error" | "stale"
  >(defaults.ftp_host ? "ok" : "idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Any edit after a test invalidates it: the user must re-test before
  // moving on, otherwise "Conectado" would vouch for credentials that were
  // never checked.
  const update = (patch: Partial<FtpFields>) => {
    setForm((f) => ({ ...f, ...patch }));
    setStatus((s) => (s === "ok" || s === "error" ? "stale" : s));
  };

  const set =
    (key: "ftp_host" | "ftp_user" | "ftp_pass" | "ftp_root") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [key]: e.target.value });

  const test = async () => {
    setStatus("testing");
    setErrorMsg("");
    try {
      await invoke("test_ftp_connection", {
        host: form.ftp_host.trim(),
        port: form.ftp_port,
        user: form.ftp_user,
        pass: form.ftp_pass,
        tls: form.ftp_tls,
        tlsAcceptInvalidCerts: form.ftp_tls_accept_invalid_certs,
      });
      setStatus("ok");
    } catch (e: unknown) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  };

  const canTest = form.ftp_host.trim() !== "" && form.ftp_user.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (status === "ok") onNext({ ...form, ftp_host: form.ftp_host.trim() });
        else if (canTest && status !== "testing") void test();
      }}
      style={{ display: "grid", gap: 16 }}
    >
      <section style={wizardSectionCard}>
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              ...responsivePairGrid,
              gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 180px)",
            }}
          >
            <div style={wizardField}>
              <label style={wizardLabel} htmlFor="wiz-ftp-host">
                {t(language, "wizard.host")}
              </label>
              <input
                id="wiz-ftp-host"
                style={wizardInput}
                value={form.ftp_host}
                onChange={set("ftp_host")}
                placeholder="192.168.1.100"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div style={wizardField}>
              <label style={wizardLabel} htmlFor="wiz-ftp-port">
                {t(language, "wizard.port")}
              </label>
              <input
                id="wiz-ftp-port"
                style={wizardInput}
                type="number"
                min={1}
                max={65535}
                value={form.ftp_port}
                onChange={(e) => update({ ftp_port: Number(e.target.value) || 21 })}
              />
            </div>
          </div>

          <div style={responsivePairGrid}>
            <div style={wizardField}>
              <label style={wizardLabel} htmlFor="wiz-ftp-user">
                {t(language, "wizard.username")}
              </label>
              <input
                id="wiz-ftp-user"
                style={wizardInput}
                value={form.ftp_user}
                onChange={set("ftp_user")}
                autoComplete="username"
                spellCheck={false}
                required
              />
            </div>
            <div style={wizardField}>
              <label style={wizardLabel} htmlFor="wiz-ftp-pass">
                {t(language, "wizard.password")}
              </label>
              <input
                id="wiz-ftp-pass"
                style={wizardInput}
                type="password"
                value={form.ftp_pass}
                onChange={set("ftp_pass")}
                autoComplete="current-password"
              />
            </div>
          </div>

          <div style={wizardField}>
            <label style={wizardLabel} htmlFor="wiz-ftp-root">
              {t(language, "wizard.rootPath")}
            </label>
            <input
              id="wiz-ftp-root"
              style={wizardInput}
              value={form.ftp_root}
              onChange={set("ftp_root")}
              placeholder="/Compartida"
              spellCheck={false}
            />
            <span style={wizardSubtext}>{t(language, "wizard.rootPathHelp")}</span>
          </div>

          <FtpTlsFields
            language={language}
            value={{
              ftp_tls: form.ftp_tls,
              ftp_tls_accept_invalid_certs: form.ftp_tls_accept_invalid_certs,
            }}
            onChange={(next) => update(next)}
          />
        </div>
      </section>

      {status === "error" && (
        <div
          role="alert"
          style={{
            ...wizardSectionCard,
            boxShadow: "none",
            border:
              "1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)",
            background:
              "color-mix(in srgb, var(--color-danger) 8%, var(--color-surface))",
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{ fontSize: 13, fontWeight: 700, color: "var(--color-danger)" }}
          >
            {friendlyFtpError(language, errorMsg)}
          </div>
          {errorMsg && (
            <div style={wizardSubtext}>
              {t(language, "wizard.ftpErrorDetail")}: {errorMsg}
            </div>
          )}
        </div>
      )}

      <WizardFooter
        language={language}
        onBack={onBack}
        nextType="submit"
        nextDisabled={status !== "ok"}
        nextBusy={transitioning}
        nextLabel={transitioning ? t(language, "common.loading") : undefined}
        extra={
          <>
            <button
              type="button"
              style={wizardGhostBtn(status === "testing" || !canTest)}
              onClick={test}
              disabled={status === "testing" || !canTest}
            >
              <AppIcon name="activity" size={15} strokeWidth={2.1} />
              {status === "testing"
                ? t(language, "common.testing")
                : t(language, "wizard.testConnection")}
            </button>
            {status === "ok" && (
              <WizardStatusPill tone="success">
                {t(language, "common.connected")}
              </WizardStatusPill>
            )}
            {status === "stale" && (
              <span style={wizardSubtext}>{t(language, "wizard.retestNeeded")}</span>
            )}
          </>
        }
      />
    </form>
  );
}
