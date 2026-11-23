import { useState } from "react";
import { Search, X } from "lucide-react";
import { formInputCompact } from "../../lib/formStyles";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import { SETTINGS_GROUPS, type SettingsGroupId } from "./settingsNav";

export interface SettingsIndexEntry {
  id: string;
  title: string;
  group: SettingsGroupId;
  /** Hidden by the current group/search filter. */
  hidden: boolean;
}

interface SettingsNavMenuProps {
  language: AppLanguage;
  isMobile: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  activeGroup: SettingsGroupId;
  onGroupChange: (group: SettingsGroupId) => void;
  entries: SettingsIndexEntry[];
  onJump: (id: string) => void;
}

interface GroupButtonProps {
  active: boolean;
  label: string;
  icon: (typeof SETTINGS_GROUPS)[number]["icon"];
  badge?: number;
  compact: boolean;
  onClick: () => void;
}

function GroupButton({
  active,
  label,
  icon: Icon,
  badge,
  compact,
  onClick,
}: GroupButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 6 : 10,
        width: compact ? undefined : "100%",
        flexShrink: 0,
        height: compact ? 34 : 36,
        padding: compact ? "0 12px" : "0 10px",
        borderRadius: compact ? "var(--radius-full)" : "var(--radius)",
        border: compact
          ? `1px solid ${
              active
                ? "color-mix(in srgb, var(--color-primary) 55%, var(--color-border))"
                : "color-mix(in srgb, var(--color-border) 70%, transparent)"
            }`
          : "1px solid transparent",
        background: active
          ? "color-mix(in srgb, var(--color-primary) 16%, transparent)"
          : hovered
            ? "color-mix(in srgb, var(--color-surface-2) 80%, transparent)"
            : "transparent",
        color: active ? "var(--color-text)" : "var(--color-text-muted)",
        fontFamily: "inherit",
        fontSize: 13.5,
        fontWeight: active ? 650 : 550,
        cursor: "pointer",
        textAlign: "left",
        whiteSpace: "nowrap",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      <Icon
        size={16}
        strokeWidth={active ? 2.3 : 2}
        aria-hidden="true"
        style={{ color: active ? "var(--color-primary)" : undefined, flexShrink: 0 }}
      />
      <span style={{ flex: compact ? undefined : 1 }}>{label}</span>
      {badge !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "1px 7px",
            borderRadius: "var(--radius-full)",
            background: "color-mix(in srgb, var(--color-primary) 22%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * Settings menu: a search box plus the five setting blocks. Side column on
 * desktop (with the active block's sections listed below it), a scrollable
 * row of chips on mobile.
 */
export default function SettingsNavMenu({
  language,
  isMobile,
  query,
  onQueryChange,
  activeGroup,
  onGroupChange,
  entries,
  onJump,
}: SettingsNavMenuProps) {
  const searching = query.trim().length > 0;
  const groups = SETTINGS_GROUPS.filter((group) =>
    entries.some((entry) => entry.group === group.id),
  );
  const hitsByGroup = (id: SettingsGroupId) =>
    entries.filter((entry) => entry.group === id && !entry.hidden).length;

  const search = (
    <div style={{ position: "relative" }}>
      <Search
        size={15}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--color-text-muted)",
          pointerEvents: "none",
        }}
      />
      <input
        type="text"
        role="searchbox"
        enterKeyHint="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onQueryChange("");
        }}
        placeholder={t(language, "settingsNav.searchPlaceholder")}
        aria-label={t(language, "settingsNav.searchPlaceholder")}
        style={{
          ...formInputCompact,
          paddingLeft: 32,
          paddingRight: searching ? 30 : 10,
          fontSize: isMobile ? 16 : 14,
          height: 36,
        }}
      />
      {searching && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label={t(language, "settingsNav.clearSearch")}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: "var(--radius-full)",
            background: "transparent",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "10px 12px",
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
          background: "var(--color-bg)",
          flexShrink: 0,
        }}
      >
        {search}
        <nav
          aria-label={t(language, "settingsNav.menuLabel")}
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {groups.map((group) => (
            <GroupButton
              key={group.id}
              compact
              active={!searching && group.id === activeGroup}
              label={t(language, group.label)}
              icon={group.icon}
              badge={searching ? hitsByGroup(group.id) || undefined : undefined}
              onClick={() => onGroupChange(group.id)}
            />
          ))}
        </nav>
      </div>
    );
  }

  return (
    <aside
      style={{
        width: 236,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "16px 12px 16px 20px",
        borderRight:
          "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        overflowY: "auto",
      }}
    >
      {search}
      <nav
        aria-label={t(language, "settingsNav.menuLabel")}
        style={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {groups.map((group) => {
          const active = !searching && group.id === activeGroup;
          const sections = entries.filter((entry) => entry.group === group.id);
          return (
            <div key={group.id}>
              <GroupButton
                compact={false}
                active={active}
                label={t(language, group.label)}
                icon={group.icon}
                badge={searching ? hitsByGroup(group.id) || undefined : undefined}
                onClick={() => onGroupChange(group.id)}
              />
              {active && sections.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    margin: "2px 0 8px 18px",
                    paddingLeft: 10,
                    borderLeft:
                      "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
                  }}
                >
                  {sections.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onJump(entry.id)}
                      style={{
                        textAlign: "left",
                        padding: "5px 8px",
                        border: "none",
                        borderRadius: 6,
                        background: "transparent",
                        color: "var(--color-text-muted)",
                        fontFamily: "inherit",
                        fontSize: 12.5,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
