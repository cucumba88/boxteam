import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import AppIcon from "../AppIcon";
import Toggle from "../Toggle";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import {
  WizardFooter,
  wizardGhostBtn,
  wizardSectionCard,
  wizardSubtext,
} from "./wizardUi";

const pathBox: React.CSSProperties = {
  padding: "0.7rem 0.9rem",
  borderRadius: "var(--radius)",
  border: "1px solid color-mix(in srgb, var(--color-border) 78%, transparent)",
  background: "color-mix(in srgb, var(--color-surface-2) 84%, transparent)",
  color: "var(--color-text)",
  fontSize: 13,
  fontFamily: "var(--font-mono, monospace)",
  wordBreak: "break-all",
  minHeight: 38,
  display: "flex",
  alignItems: "center",
};

export default function StepDataDir({
  language,
  onNext,
  onBack,
}: {
  language: AppLanguage;
  onNext: () => void;
  onBack: () => void;
}) {
  const [defaultDir, setDefaultDir] = useState<string>("");
  const [useDefault, setUseDefault] = useState(true);
  const [customDir, setCustomDir] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    invoke<string>("get_db_path")
      .then(setDefaultDir)
      .catch(() => {});
  }, []);

  const pickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) setCustomDir(selected);
    } catch {
      // user cancelled
    }
  };

  const handleNext = async () => {
    setSaving(true);
    setErrorMsg("");
    try {
      const dir = useDefault ? null : customDir || null;
      if (dir) await invoke("init_db_path", { dir });
      onNext();
    } catch (err: unknown) {
      setErrorMsg(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ ...wizardSectionCard, display: "grid", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
            {t(language, "wizard.dataDirDefault")}
          </span>
          <Toggle
            label={t(language, "wizard.dataDirDefault")}
            checked={useDefault}
            onChange={setUseDefault}
          />
        </div>

        {useDefault ? (
          <div style={pathBox}>
            <span style={{ opacity: defaultDir ? 1 : 0.45 }}>{defaultDir || "…"}</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ ...pathBox, flex: 1, minWidth: 220 }}>
              <span style={{ opacity: customDir ? 1 : 0.45 }}>
                {customDir || t(language, "wizard.dataDirPick")}
              </span>
            </div>
            <button style={wizardGhostBtn()} onClick={pickFolder} type="button">
              <AppIcon name="folder" size={14} strokeWidth={2.2} />
              {t(language, "common.browse")}
            </button>
          </div>
        )}
        <span style={wizardSubtext}>{t(language, "wizard.dataDirHint")}</span>
      </section>

      {errorMsg && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--color-danger)" }}>
          {errorMsg}
        </p>
      )}

      <WizardFooter
        language={language}
        onBack={onBack}
        onNext={handleNext}
        nextBusy={saving}
        nextDisabled={!useDefault && !customDir}
      />
    </div>
  );
}
