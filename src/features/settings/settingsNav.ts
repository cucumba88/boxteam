import { createContext, useContext } from "react";
import {
  Bell,
  FolderOpen,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { t } from "../../utils/i18n";

type MessageKey = Parameters<typeof t>[1];

export type SettingsGroupId =
  | "general"
  | "library"
  | "connection"
  | "notifications"
  | "system";

export interface SettingsGroup {
  id: SettingsGroupId;
  icon: LucideIcon;
  label: MessageKey;
  description: MessageKey;
}

/** The blocks of the Settings side menu, in display order. */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "general",
    icon: SlidersHorizontal,
    label: "settingsNav.general",
    description: "settingsNav.generalDesc",
  },
  {
    id: "library",
    icon: FolderOpen,
    label: "settingsNav.library",
    description: "settingsNav.libraryDesc",
  },
  {
    id: "connection",
    icon: Plug,
    label: "settingsNav.connection",
    description: "settingsNav.connectionDesc",
  },
  {
    id: "notifications",
    icon: Bell,
    label: "settingsNav.notifications",
    description: "settingsNav.notificationsDesc",
  },
  {
    id: "system",
    icon: ShieldCheck,
    label: "settingsNav.system",
    description: "settingsNav.systemDesc",
  },
];

export function isSettingsGroupId(value: unknown): value is SettingsGroupId {
  return SETTINGS_GROUPS.some((group) => group.id === value);
}

/** Lowercase and strip accents so "notificación" matches "notificacion". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** True when every word of `query` appears somewhere in the given texts. */
export function matchesSettingsQuery(
  query: string,
  ...texts: (string | undefined)[]
): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export interface SettingsNavState {
  /** Group shown in the content area; null renders every section. */
  activeGroup: SettingsGroupId | null;
  /** Search text; when not empty it overrides the group filter. */
  query: string;
}

export const SettingsNavContext = createContext<SettingsNavState>({
  activeGroup: null,
  query: "",
});

/**
 * Whether a section is on screen for the current group/search, and whether
 * it must be forced open (a search hit should show its contents).
 */
export function useSettingsSectionVisibility(
  group: SettingsGroupId,
  ...texts: (string | undefined)[]
): { visible: boolean; forceOpen: boolean } {
  const { activeGroup, query } = useContext(SettingsNavContext);
  if (query.trim()) {
    const hit = matchesSettingsQuery(query, ...texts);
    return { visible: hit, forceOpen: hit };
  }
  return {
    visible: activeGroup === null || activeGroup === group,
    forceOpen: false,
  };
}

const STORAGE_KEY = "boxteam:settings-group";

export function readStoredGroup(): SettingsGroupId | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isSettingsGroupId(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeGroup(group: SettingsGroupId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, group);
  } catch {
    // Private mode / blocked storage: the menu just starts on General.
  }
}
