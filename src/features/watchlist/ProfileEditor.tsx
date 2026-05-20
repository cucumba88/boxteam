import Toggle from "../../components/Toggle";
import { formInputStandard, formSelectStandard } from "../../lib/formStyles";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import type { QualityProfile } from "./types";

const inputStyle = formInputStandard;
const selectStyle = formSelectStandard;

export const RESOLUTION_OPTIONS = ["", "720P", "1080P", "2160P"];
export const CODEC_OPTIONS = ["HEVC", "AVC", "AV1", "VC-1"];
export const AUDIO_OPTIONS = [
  "DTS-X",
  "Atmos",
  "TrueHD",
  "DTS-HD MA",
  "DTS",
  "AAC",
  "AC3",
  "EAC3",
];
export const RELEASE_OPTIONS = [
  "BDREMUX",
  "BluRay",
  "WEB-DL",
  "WEBRip",
  "HDTV",
  "CAM",
];

export interface ProfileFormState {
  name: string;
  min_resolution: string;
  preferred_resolution: string;
  prefer_hdr: boolean;
  preferred_codecs: string[];
  preferred_audio_codecs: string[];
  preferred_release_types: string[];
  min_size_gb: string;
  max_size_gb: string;
}

export const emptyForm = (): ProfileFormState => ({
  name: "",
  min_resolution: "",
  preferred_resolution: "",
  prefer_hdr: false,
  preferred_codecs: [],
  preferred_audio_codecs: [],
  preferred_release_types: [],
  min_size_gb: "",
  max_size_gb: "",
});

export function profileToForm(p: QualityProfile): ProfileFormState {
  return {
    name: p.name,
    min_resolution: p.min_resolution ?? "",
    preferred_resolution: p.preferred_resolution ?? "",
    prefer_hdr: p.prefer_hdr,
    preferred_codecs: JSON.parse(p.preferred_codecs) as string[],
    preferred_audio_codecs: JSON.parse(p.preferred_audio_codecs) as string[],
    preferred_release_types: JSON.parse(p.preferred_release_types) as string[],
    min_size_gb: p.min_size_gb != null ? String(p.min_size_gb) : "",
    max_size_gb: p.max_size_gb != null ? String(p.max_size_gb) : "",
  };
}

export function formToParams(form: ProfileFormState) {
  return {
    name: form.name,
    min_resolution: form.min_resolution || undefined,
    preferred_resolution: form.preferred_resolution || undefined,
    prefer_hdr: form.prefer_hdr,
    preferred_codecs: JSON.stringify(form.preferred_codecs),
    preferred_audio_codecs: JSON.stringify(form.preferred_audio_codecs),
    preferred_release_types: JSON.stringify(form.preferred_release_types),
    min_size_gb: form.min_size_gb ? parseFloat(form.min_size_gb) : undefined,
    max_size_gb: form.max_size_gb ? parseFloat(form.max_size_gb) : undefined,
  };
}

function toggleArr(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function MultiChipPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(toggleArr(selected, opt))}
              style={{
                border: active ? "none" : "1px solid var(--color-border)",
                borderRadius: "var(--radius-full)",
                padding: "3px 10px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                background: active ? "var(--color-primary)" : "transparent",
                color: active ? "#fff" : "var(--color-text-muted)",
                transition: "background 0.15s ease, color 0.15s ease",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProfileEditor({
  form,
  onChange,
  language,
}: {
  form: ProfileFormState;
  onChange: (f: ProfileFormState) => void;
  language: AppLanguage;
}) {
  const set = (key: keyof ProfileFormState, val: unknown) =>
    onChange({ ...form, [key]: val });
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          {t(language, "qualityProfile.name")}
        </div>
        <input
          style={inputStyle}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t(language, "qualityProfile.namePlaceholder")}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {t(language, "qualityProfile.minResolution")}
          </div>
          <select
            value={form.min_resolution}
            onChange={(e) => set("min_resolution", e.target.value)}
            style={selectStyle}
          >
            <option value="">
              {t(language, "qualityProfile.anyResolution")}
            </option>
            {RESOLUTION_OPTIONS.filter(Boolean).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {t(language, "qualityProfile.preferredResolution")}
          </div>
          <select
            value={form.preferred_resolution}
            onChange={(e) => set("preferred_resolution", e.target.value)}
            style={selectStyle}
          >
            <option value="">
              {t(language, "qualityProfile.anyResolution")}
            </option>
            {RESOLUTION_OPTIONS.filter(Boolean).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <MultiChipPicker
        label={t(language, "qualityProfile.preferredCodecs")}
        options={CODEC_OPTIONS}
        selected={form.preferred_codecs}
        onChange={(v) => set("preferred_codecs", v)}
      />
      <MultiChipPicker
        label={t(language, "qualityProfile.preferredAudio")}
        options={AUDIO_OPTIONS}
        selected={form.preferred_audio_codecs}
        onChange={(v) => set("preferred_audio_codecs", v)}
      />
      <MultiChipPicker
        label={t(language, "qualityProfile.preferredRelease")}
        options={RELEASE_OPTIONS}
        selected={form.preferred_release_types}
        onChange={(v) => set("preferred_release_types", v)}
      />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-text)",
          }}
        >
          <Toggle
            checked={form.prefer_hdr}
            onChange={(v) => set("prefer_hdr", v)}
          />
          {t(language, "qualityProfile.preferHdr")}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {t(language, "qualityProfile.minSizeGb")}
          </div>
          <input
            style={{ ...inputStyle, width: 100 }}
            type="number"
            min={0}
            step={0.5}
            value={form.min_size_gb}
            onChange={(e) => set("min_size_gb", e.target.value)}
            placeholder="0"
          />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {t(language, "qualityProfile.maxSizeGb")}
          </div>
          <input
            style={{ ...inputStyle, width: 100 }}
            type="number"
            min={0}
            step={0.5}
            value={form.max_size_gb}
            onChange={(e) => set("max_size_gb", e.target.value)}
            placeholder="∞"
          />
        </div>
      </div>
    </div>
  );
}
