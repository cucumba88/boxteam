import { ReactNode, useEffect, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import oscataMark from "../assets/brand/oscata-mark.svg";

const COLLAPSED_KEY = "oscata.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export type SidebarItem<TabId extends string> = {
  id: TabId;
  label: string;
  icon: LucideIcon;
  count?: number;
};

export type SidebarSection<TabId extends string> = {
  label: string;
  items: SidebarItem<TabId>[];
};

interface Props<TabId extends string> {
  sections: SidebarSection<TabId>[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onOpenSettings: () => void;
  settingsLabel: string;
  /** When true, the Settings button gets the active accent (the user is on
   *  the Settings page). The library tabs should appear unselected. */
  settingsActive?: boolean;
  /** Optional footer slot — language toggle, user avatar menu, etc. */
  footerSlot?: ReactNode;
  /**
   * When the sidebar is collapsed, the wide footerSlot doesn't fit. Provide
   * a single compact element (typically just the avatar button) to keep
   * essential profile / menu access reachable.
   */
  collapsedFooterSlot?: ReactNode;
}

export default function AppSidebar<TabId extends string>({
  sections,
  activeTab,
  onTabChange,
  onOpenSettings,
  settingsLabel,
  settingsActive = false,
  footerSlot,
  collapsedFooterSlot,
}: Props<TabId>) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  return (
    <aside className={`shell-sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="shell-sidebar-header">
        {!collapsed && (
          <span className="shell-sidebar-wordmark" aria-label="Oscata">
            <img src={oscataMark} alt="" aria-hidden="true" />
            <span>scata</span>
          </span>
        )}
        <button
          type="button"
          className="shell-sidebar-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight size={16} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <ChevronsLeft size={16} strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>
      </div>

      {sections.map((section) => (
        <div key={section.label} className="shell-sidebar-section">
          <div className="shell-sidebar-section-label">{section.label}</div>
          {section.items.map((item) => {
            const Icon = item.icon;
            // When Settings is open we suppress the library/transfer active
            // accent so the sidebar reflects "you're on Settings now".
            const active = !settingsActive && item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                className={`shell-sidebar-item${active ? " active" : ""}`}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <span className="shell-sidebar-item-icon">
                  <Icon size={18} strokeWidth={active ? 2.4 : 2.0} aria-hidden="true" />
                </span>
                <span className="shell-sidebar-item-label">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="shell-sidebar-item-count">{item.count}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      <div className="shell-sidebar-spacer" />

      <div className="shell-sidebar-footer">
        {collapsed ? (
          <>
            {/* Collapsed: stack the icon-only settings button and any
                compact footer slot vertically; both stay reachable at 64px. */}
            <button
              type="button"
              className={`shell-sidebar-item${settingsActive ? " active" : ""}`}
              onClick={onOpenSettings}
              title={settingsLabel}
              aria-label={settingsLabel}
            >
              <span className="shell-sidebar-item-icon">
                <SettingsIcon
                  size={18}
                  strokeWidth={settingsActive ? 2.4 : 2.0}
                  aria-hidden="true"
                />
              </span>
            </button>
            {collapsedFooterSlot && (
              <div
                className="shell-sidebar-footer-row"
                style={{ justifyContent: "center" }}
              >
                {collapsedFooterSlot}
              </div>
            )}
          </>
        ) : (
          /* Expanded: one row → Settings | Language | Theme | (avatar). */
          <div
            className="shell-sidebar-footer-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={onOpenSettings}
              title={settingsLabel}
              aria-label={settingsLabel}
              className={settingsActive ? "active" : ""}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: settingsActive
                  ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                  : "color-mix(in srgb, var(--color-surface) 70%, transparent)",
                color: settingsActive
                  ? "var(--color-primary)"
                  : "var(--color-text)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                flex: 1,
                minWidth: 0,
                justifyContent: "flex-start",
              }}
            >
              <SettingsIcon
                size={15}
                strokeWidth={settingsActive ? 2.4 : 2.0}
                aria-hidden="true"
              />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {settingsLabel}
              </span>
            </button>
            {footerSlot}
          </div>
        )}
      </div>
    </aside>
  );
}
