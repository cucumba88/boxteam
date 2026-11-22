import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import AppIcon from "../AppIcon";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import type { WizardConfig } from "./types";
import {
  WizardFooter,
  wizardField,
  wizardGhostBtn,
  wizardInput,
  wizardLabel,
  wizardSectionCard,
  wizardSubtext,
} from "./wizardUi";

export default function StepDownloads({
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
  const [folder, setFolder] = useState(defaults.download_folder);
  const [maxConcurrent, setMaxConcurrent] = useState(
    defaults.max_concurrent_downloads,
  );

  const browse = async () => {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string" && dir) setFolder(dir);
    } catch {
      // user cancelled
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext({
          download_folder: folder.trim(),
          max_concurrent_downloads: maxConcurrent,
        });
      }}
      style={{ display: "grid", gap: 16 }}
    >
      <section style={wizardSectionCard}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={wizardField}>
            <label style={wizardLabel} htmlFor="wiz-dl-folder">
              {t(language, "settings.downloadFolder")}
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                id="wiz-dl-folder"
                style={{ ...wizardInput, flex: 1, minWidth: 220 }}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={t(language, "settings.downloadFolderPlaceholder")}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={browse}
                style={{ ...wizardGhostBtn(), whiteSpace: "nowrap", minHeight: 42 }}
              >
                <AppIcon name="folder" size={15} strokeWidth={2.1} />
                {t(language, "common.browse")}
              </button>
            </div>
            <span style={wizardSubtext}>
              {t(language, "wizard.downloadFolderHelp")}
            </span>
          </div>

          <div style={wizardField}>
            <label style={wizardLabel} htmlFor="wiz-dl-max">
              {t(language, "settings.maxConcurrent")}
            </label>
            <select
              id="wiz-dl-max"
              style={{ ...wizardInput, maxWidth: 180 }}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span style={wizardSubtext}>
              {t(language, "settings.maxConcurrentHelp")}
            </span>
          </div>
        </div>
      </section>

      <WizardFooter
        language={language}
        onBack={onBack}
        nextType="submit"
        nextLabel={folder.trim() ? undefined : t(language, "wizard.skipForNow")}
      />
    </form>
  );
}
