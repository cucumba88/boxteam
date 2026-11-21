import Toggle from "./Toggle";
import type { AppLanguage } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";

export interface FtpTlsValue {
  ftp_tls: boolean;
  ftp_tls_accept_invalid_certs: boolean;
}

interface FtpTlsFieldsProps {
  language: AppLanguage;
  value: FtpTlsValue;
  onChange: (next: FtpTlsValue) => void;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text)",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--color-text-muted)",
};

/**
 * FTPS toggles shared by the desktop wizard, the web setup wizard and
 * Settings. Plain FTP stays the default; the second toggle only shows once
 * FTPS is on.
 */
export default function FtpTlsFields({ language, value, onChange }: FtpTlsFieldsProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={rowStyle}>
        <div style={{ display: "grid", gap: 2 }}>
          <span style={titleStyle}>{t(language, "ftp.tls")}</span>
          <span style={hintStyle}>
            {t(language, value.ftp_tls ? "ftp.tlsHintOn" : "ftp.tlsHintOff")}
          </span>
        </div>
        <Toggle label={t(language, "ftp.tls")}
          checked={value.ftp_tls}
          onChange={(checked) =>
            onChange({
              ftp_tls: checked,
              ftp_tls_accept_invalid_certs: checked
                ? value.ftp_tls_accept_invalid_certs
                : false,
            })
          }
        />
      </div>
      {value.ftp_tls && (
        <div style={rowStyle}>
          <div style={{ display: "grid", gap: 2 }}>
            <span style={titleStyle}>{t(language, "ftp.tlsInsecure")}</span>
            <span style={hintStyle}>{t(language, "ftp.tlsInsecureHint")}</span>
          </div>
          <Toggle label={t(language, "ftp.tlsInsecure")}
            checked={value.ftp_tls_accept_invalid_certs}
            onChange={(checked) =>
              onChange({ ...value, ftp_tls_accept_invalid_certs: checked })
            }
          />
        </div>
      )}
    </div>
  );
}
