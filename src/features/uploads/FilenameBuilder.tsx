import { useState, useEffect } from "react";
import { Copy, FolderOpen, FileVideo } from "lucide-react";
import type { LocalMediaInfo, MediaType } from "./types";
import { formInputCompact, formSelectCompact } from "../../lib/formStyles";
import Toggle from "../../components/Toggle";
import {
  SOURCE_OPTIONS as SHARED_SOURCE_OPTIONS,
  RESOLUTIONS,
  CODECS,
  AUDIO_CODECS,
  HDR_OPTIONS,
  hdrFilenameToken,
  isDV,
  mapReleaseType,
  normalizeHdr,
  normalizeResolution,
  formatChannels,
  mergeHdr,
  type QualityChoice,
} from "./quality";
import { audioFilenameToken, canonicalAudio } from "../../utils/techTags";

/** Values read from the file/folder name, used when ffprobe is unavailable
 *  or could not tell (e.g. the release source). */
export interface FilenameFallback {
  resolution?: string | null;
  codec?: string | null;
  hdr?: string | null;
  audio?: string | null;
  channels?: string | null;
}

interface FilenameBuilderProps {
  info: LocalMediaInfo | null;
  mediaType: MediaType;
  defaultTitle?: string; // Movie: title. TV: episode title (optional)
  defaultShowName?: string; // TV only: show name
  defaultYear?: number; // Movie only
  defaultSeason?: number; // TV only
  defaultEpisode?: number; // TV only
  defaultReleaseType?: string; // Detected from filename (e.g. "BDREMUX", "WEB-DL")
  extension: string;
  dest?: string; // FTP destination folder — shows full path preview
  fallback?: FilenameFallback;
  onChange: (filename: string) => void;
  /** Reports the quality dropdowns so the queued upload carries what the
   *  user picked, not only what was detected. */
  onQualityChange?: (quality: QualityChoice) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Sources / resolutions / codecs / audio / HDR are defined in ./quality so
// AnalysisRow and FilenameBuilder share the same canonical lists.
const SOURCE_OPTIONS = SHARED_SOURCE_OPTIONS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Remove " - " subtitle separators from a title string and collapse spaces. */
function stripDash(s: string): string {
  return s
    .replace(/\s+-\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Render a `<select>` whose options are the canonical list, plus an extra
 *  option for `value` when it is non-empty and not already in `options`.
 *  This means a value seeded by ffprobe/parser that doesn't match the
 *  dropdown is preserved rather than silently dropped to blank. */
function renderOptions(options: string[], value: string): React.ReactNode {
  const has = options.some((o) => o.toLowerCase() === value.toLowerCase());
  return (
    <>
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
      {value && !has && <option value={value}>{value}</option>}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FilenameBuilder({
  info,
  mediaType,
  defaultTitle = "",
  defaultShowName = "",
  defaultYear,
  defaultSeason = 1,
  defaultEpisode, // undefined = season mode (no episode number in filename)
  defaultReleaseType,
  extension,
  dest,
  fallback,
  onChange,
  onQualityChange,
}: FilenameBuilderProps) {
  // Shared fields. Seeded values are normalised so the dropdowns can match
  // them against the canonical lists (e.g. "4K" → "2160p", "DOLBYVISION" → "DV").
  const [resolution, setResolution] = useState(
    normalizeResolution(info?.resolution ?? fallback?.resolution) ||
      (info?.resolution ?? fallback?.resolution ?? ""),
  );
  const [codec, setCodec] = useState(info?.codec ?? fallback?.codec ?? "");
  // ffprobe sees HDR10/HDR10+/DV in the stream; the filename may add what an
  // old ffprobe misses. Merge both so neither signal is dropped.
  const [hdr, setHdr] = useState(
    mergeHdr(info?.hdr, fallback?.hdr) || normalizeHdr(info?.hdr) || (info?.hdr ?? ""),
  );
  // Audio tracks — one entry per physical track in the file
  type AudioTrackEntry = { codec: string; channels: string };
  const [audioTracks, setAudioTracks] = useState<AudioTrackEntry[]>(() => {
    if (info?.audio_tracks && info.audio_tracks.length > 0) {
      return info.audio_tracks.map((t) => ({
        codec: canonicalAudio(t.codec),
        channels: formatChannels(t.channels ?? null),
      }));
    }
    return [
      {
        codec: canonicalAudio(fallback?.audio),
        channels: fallback?.channels ?? "",
      },
    ];
  });

  const updateAudioTrack = (idx: number, field: keyof AudioTrackEntry, value: string) => {
    setAudioTracks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    );
  };
  const removeAudioTrack = (idx: number) => {
    if (audioTracks.length <= 1) {
      setAudioTracks([{ codec: "", channels: "" }]);
    } else {
      setAudioTracks((prev) => prev.filter((_, i) => i !== idx));
    }
  };
  const addAudioTrack = () => {
    setAudioTracks((prev) => [...prev, { codec: "", channels: "" }]);
  };
  const [langs, setLangs] = useState(
    (info?.languages ?? []).map((l) => l.toUpperCase()).join(", "),
  );
  const [source, setSource] = useState(() =>
    mapReleaseType(defaultReleaseType),
  );
  const [subs, setSubs] = useState(
    () => (info?.subtitle_tracks?.length ?? 0) > 0,
  );
  const [copied, setCopied] = useState(false);

  // Movie-specific (strip subtitle dashes on init)
  const [title, setTitle] = useState(() => stripDash(defaultTitle));
  const [year, setYear] = useState(defaultYear ? String(defaultYear) : "");

  // TV-specific
  const episodeMode = defaultEpisode !== undefined;
  const [showName, setShowName] = useState(() => stripDash(defaultShowName));
  const [season, setSeason] = useState(defaultSeason);
  const [episode, setEpisode] = useState(defaultEpisode ?? 1);
  const [episodeTitle, setEpisodeTitle] = useState(() =>
    stripDash(defaultTitle),
  );

  const buildFilename = () => {
    const ext = extension.startsWith(".") ? extension.slice(1) : extension;

    if (mediaType === "tv") {
      // TV: dot-separated format — Show.Name.S01E01.Episode.Title.1080p.HEVC.SPA.ENG.mkv
      const parts: string[] = [];
      if (showName.trim()) parts.push(stripDash(showName).replace(/\s+/g, "."));
      const s = String(season).padStart(2, "0");
      if (episodeMode) {
        const e = String(episode).padStart(2, "0");
        parts.push(`S${s}E${e}`);
        if (episodeTitle.trim())
          parts.push(stripDash(episodeTitle).replace(/\s+/g, "."));
      } else {
        parts.push(`S${s}`);
      }
      if (source.trim()) parts.push(source.trim().toUpperCase());
      if (resolution.trim()) parts.push(resolution.trim());
      if (codec.trim()) parts.push(codec.trim());
      const core = hdrFilenameToken(hdr);
      if (core) parts.push(core);
      if (isDV(hdr)) parts.push("DV");
      audioTracks
        .filter((t) => t.codec.trim())
        .forEach((t) => {
          const ch = t.channels.trim();
          const token = audioFilenameToken(t.codec, ".");
          parts.push(ch ? `${token}.${ch}` : token);
        });
      const langList = langs
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((l) => l.toUpperCase());
      parts.push(...langList);
      const name = parts.join(".");
      return ext ? `${name}.${ext}` : name;
    }

    // Movie: Title (Year.SOURCE.RESOLUTION.CODEC.HDR.LANG.AUDIO CHANNELS.SUBS)[Dolby Vision].ext
    const titleClean = stripDash(title);
    const tags: string[] = [];
    if (year.trim()) tags.push(year.trim());
    if (source.trim()) tags.push(source.trim().toUpperCase());
    if (resolution.trim()) tags.push(resolution.trim().toUpperCase());
    if (codec.trim()) tags.push(codec.trim().toUpperCase());
    const core = hdrFilenameToken(hdr);
    if (core) tags.push(core.toUpperCase());
    const langList = langs
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((l) => l.toUpperCase());
    tags.push(...langList);
    audioTracks
      .filter((t) => t.codec.trim())
      .forEach((t) => {
        const ch = t.channels.trim();
        const token = audioFilenameToken(t.codec, " ");
        tags.push(ch ? `${token} ${ch}` : token);
      });
    if (subs) tags.push("SUBS");

    const inner = tags.join(".");
    const dvBracket = isDV(hdr) ? "[Dolby Vision]" : "";
    const base = titleClean
      ? `${titleClean} (${inner})${dvBracket}`
      : inner
        ? `(${inner})${dvBracket}`
        : "";
    return ext ? `${base}.${ext}` : base;
  };

  const filename = buildFilename();

  // Push the computed filename to the parent on mount and whenever any field
  // changes. Done from an effect (not right after each setState) so the
  // parent always gets the name built from the *new* values.
  useEffect(() => {
    onChange(filename);
  }, [filename]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstAudioCodec = audioTracks[0]?.codec ?? "";
  useEffect(() => {
    onQualityChange?.({ resolution, codec, hdr, audioCodec: firstAudioCodec });
  }, [resolution, codec, hdr, firstAudioCodec]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(filename).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--color-surface-2)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
      }}
    >
      {/* Movie fields */}
      {mediaType !== "tv" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px",
            gap: "8px 10px",
          }}
        >
          <Field label="Título">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              placeholder="The Dark Knight"
              style={inputStyle}
            />
          </Field>
          <Field label="Año">
            <input
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
              }}
              placeholder="2008"
              style={inputStyle}
              maxLength={4}
            />
          </Field>
        </div>
      )}

      {/* TV fields */}
      {mediaType === "tv" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: episodeMode ? "1fr 60px 60px" : "1fr 60px",
              gap: "8px 10px",
            }}
          >
            <Field label="Nombre de la serie">
              <input
                value={showName}
                onChange={(e) => {
                  setShowName(e.target.value);
                }}
                placeholder="Breaking Bad"
                style={inputStyle}
              />
            </Field>
            <Field label="Temp.">
              <input
                type="number"
                min={1}
                max={99}
                value={season}
                onChange={(e) => {
                  setSeason(Number(e.target.value));
                }}
                style={inputStyle}
              />
            </Field>
            {episodeMode && (
              <Field label="Ep.">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={episode}
                  onChange={(e) => {
                    setEpisode(Number(e.target.value));
                  }}
                  style={inputStyle}
                />
              </Field>
            )}
          </div>
          {episodeMode && (
            <Field label="Título del episodio (opcional)">
              <input
                value={episodeTitle}
                onChange={(e) => {
                  setEpisodeTitle(e.target.value);
                }}
                placeholder="Pilot"
                style={inputStyle}
              />
            </Field>
          )}
        </>
      )}

      {/* Quality row 1: Source / Resolution / Codec */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px 10px",
        }}
      >
        <Field label="Fuente">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
            }}
            style={selectStyle}
          >
            {renderOptions(SOURCE_OPTIONS, source)}
          </select>
        </Field>
        <Field label="Resolución">
          <select
            value={resolution}
            onChange={(e) => {
              setResolution(e.target.value);
            }}
            style={selectStyle}
          >
            {renderOptions(RESOLUTIONS, resolution)}
          </select>
        </Field>
        <Field label="Códec vídeo">
          <select
            value={codec}
            onChange={(e) => {
              setCodec(e.target.value);
            }}
            style={selectStyle}
          >
            {renderOptions(CODECS, codec)}
          </select>
        </Field>
      </div>

      {/* Quality row 2: HDR */}
      <Field label="HDR">
        <select
          value={hdr}
          onChange={(e) => {
            setHdr(e.target.value);
          }}
          style={selectStyle}
        >
          {HDR_OPTIONS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
          {hdr && !HDR_OPTIONS.some((h) => h.value === hdr) && (
            <option value={hdr}>{hdr}</option>
          )}
        </select>
      </Field>

      {/* Audio tracks — one row per track */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          PISTAS DE AUDIO
        </div>
        {audioTracks.map((track, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 72px 26px",
              gap: "0 6px",
              alignItems: "center",
            }}
          >
            <select
              value={track.codec}
              onChange={(e) => updateAudioTrack(idx, "codec", e.target.value)}
              style={selectStyle}
            >
              {renderOptions(AUDIO_CODECS, track.codec)}
            </select>
            <input
              value={track.channels}
              onChange={(e) => updateAudioTrack(idx, "channels", e.target.value)}
              placeholder="5.1"
              style={inputStyle}
            />
            <button
              onClick={() => removeAudioTrack(idx)}
              title="Eliminar pista"
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: "0 5px",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addAudioTrack}
          style={{
            background: "none",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            fontSize: 11,
            padding: "4px 10px",
            textAlign: "left",
            width: "fit-content",
          }}
        >
          + Añadir pista
        </button>
      </div>

      {/* Languages + Subs (subs only for movies) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mediaType !== "tv" ? "1fr auto" : "1fr",
          gap: "8px 16px",
          alignItems: "end",
        }}
      >
        <Field label="Idiomas (ej: SPA, ENG)">
          <input
            value={langs}
            onChange={(e) => {
              setLangs(e.target.value);
            }}
            placeholder="SPA, ENG"
            style={inputStyle}
          />
        </Field>
        {mediaType !== "tv" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: 1,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              SUBS
            </span>
            <Toggle label="Subtítulos"
              checked={subs}
              onChange={(v) => {
                setSubs(v);
              }}
            />
          </div>
        )}
      </div>

      {/* Preview */}
      <div
        style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginBottom: 4,
          }}
        >
          Vista previa
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--color-surface)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--color-border)",
            padding: "7px 10px",
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 11,
              color: "var(--color-text)",
              wordBreak: "break-all",
              fontFamily: "monospace",
            }}
          >
            {filename}
          </span>
          <button
            onClick={copy}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: copied
                ? "var(--color-success)"
                : "var(--color-text-muted)",
              flexShrink: 0,
              padding: "2px 6px",
            }}
            title="Copiar"
          >
            <Copy size={12} />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        {/* Full FTP path tree */}
        {dest && (
          <div
            style={{
              marginTop: 8,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              padding: "8px 10px",
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: "var(--color-text-muted)",
              }}
            >
              <FolderOpen size={12} color="var(--color-warning)" />
              <span>{dest.endsWith("/") ? dest : dest + "/"}</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: "var(--color-text)",
                marginTop: 3,
                paddingLeft: 4,
              }}
            >
              <span style={{ color: "var(--color-border)" }}>└──</span>
              <FileVideo size={12} color="var(--color-primary)" />
              <span style={{ wordBreak: "break-all" }}>{filename}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        style={{
          fontSize: 10,
          color: "var(--color-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

const inputStyle = formInputCompact;
const selectStyle = formSelectCompact;
