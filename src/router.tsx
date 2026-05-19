import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import Library from "./pages/Library";
import { isTauri } from "./lib/transport";
import { prefetchConfig } from "./lib/configCache";
import { prefetchMedia } from "./lib/mediaCache";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { apiBase } from "./lib/transport";
import ThemeToggle from "./components/ThemeToggle";

// Code-split rarely-mounted routes. None of these are hit on the hot path
// (Library). Lazy-loading them keeps the initial JS bundle ~30–50 KB gzipped
// smaller and saves parse/eval time on slow mobile devices.
const Wizard = lazy(() => import("./pages/Wizard"));
const Login = lazy(() => import("./pages/Login"));
const WebBootstrap = lazy(() => import("./pages/WebBootstrap"));
const WebSetupWizard = lazy(() => import("./pages/WebSetupWizard"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));

export default function Router() {
  if (!isTauri()) {
    return (
      <AuthProvider>
        <WebRouter />
      </AuthProvider>
    );
  }
  const [ready, setReady] = useState<boolean | null>(null);
  const [startIndexingAfterWizard, setStartIndexingAfterWizard] =
    useState(false);

  useEffect(() => {
    invoke<boolean>("has_config")
      .then(setReady)
      .catch(() => setReady(false));
  }, []);

  if (ready === null) return <LoadingScreen />;
  return ready ? (
    <Library startIndexingOnMount={startIndexingAfterWizard} />
  ) : (
    <Suspense fallback={<LoadingScreen />}>
      <Wizard
        onComplete={(options) => {
          setStartIndexingAfterWizard(options?.startIndexing === true);
          setReady(true);
        }}
      />
    </Suspense>
  );
}

function WebRouter() {
  const { user } = useAuth();
  const [bootstrapRequired, setBootstrapRequired] = useState<boolean | null>(
    null,
  );
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const [page, setPage] = useState<"library" | "users">(
    () => window.location.pathname === "/usuarios" ? "users" : "library"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  useEffect(() => {
    // Pre-fetch the app config so Settings opens instantly (avoids the
    // full-screen loading overlay that shows while form === null).
    prefetchConfig();
    // Pre-fetch the library so the grid renders real cards instead of an
    // empty-state flash on cold load (slow remote connections).
    prefetchMedia();
  }, []);

  // Outside-click for the avatar menu is handled inside UserMenu itself
  // (it knows about the portal-rendered dropdown). Don't register a second
  // listener here — a stale `mousedown` handler used to fire BEFORE the
  // portal button's `click`, which is why "Gestionar usuarios" appeared
  // dead even after the v0.9.1 attempt.

  useEffect(() => {
    const handlePop = () => {
      setPage(window.location.pathname === "/usuarios" ? "users" : "library");
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadBootstrapStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/server-info`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`server-info ${response.status}`);
        const info = await response.json();
        if (!cancelled) {
          setBootstrapRequired(Boolean(info.bootstrap_required));
          setHasConfig(Boolean(info.has_config));
        }
      } catch {
        // Keep loading and retry; never assume login path when bootstrap state is unknown.
        if (!cancelled) {
          setBootstrapRequired(null);
          retryTimer = setTimeout(loadBootstrapStatus, 1200);
        }
      }
    };

    loadBootstrapStatus();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  if (user === null || bootstrapRequired === null || (user !== false && hasConfig === null)) {
    return <LoadingScreen />;
  }

  if (bootstrapRequired && user === false) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <WebBootstrap
          onComplete={() => {
            setBootstrapRequired(false);
            // Fresh install: no config yet after bootstrap
            setHasConfig(false);
          }}
        />
      </Suspense>
    );
  }

  if (user === false && inviteToken) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <InviteAccept
          token={inviteToken}
          onAccepted={() => {
            window.history.replaceState({}, "", window.location.pathname);
          }}
        />
      </Suspense>
    );
  }

  if (user === false) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login />
      </Suspense>
    );
  }

  // Logged in but no FTP/TMDB config yet → show the initial setup wizard
  if (hasConfig === false) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <WebSetupWizard
          onComplete={() => {
            setHasConfig(true);
            prefetchConfig();
            prefetchMedia();
          }}
        />
      </Suspense>
    );
  }

  const isAdmin = user.role === "admin";

  // Single avatar button — opens a dropdown with user info, theme, and admin links
  const avatarBtn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 999,
    border: menuOpen
      ? "1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)"
      : "1px solid color-mix(in srgb, var(--color-border) 84%, transparent)",
    background: menuOpen
      ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
      : "color-mix(in srgb, var(--color-surface) 94%, transparent)",
    color: menuOpen ? "var(--color-primary)" : "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
    userSelect: "none",
    flexShrink: 0,
  };

  const headerSlot = (
    <UserMenu
      buttonStyle={avatarBtn}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      email={user.email}
      role={user.role}
      isAdmin={isAdmin}
      page={page}
      onGoToUsers={() => {
        window.history.pushState({}, "", "/usuarios");
        setPage("users");
        setMenuOpen(false);
      }}
    />
  );

  // Library is always mounted — the user-management page renders as a
  // content-area takeover inside it (so the sidebar + status bar stay
  // visible around it). `showUsers` swaps the content area only.
  const closeUsers = () => {
    // "Volver" button — user explicitly wants to go back to library root.
    window.history.pushState({}, "", "/");
    setPage("library");
  };

  const leaveUsers = () => {
    // Sidebar / palette navigation — Library will push the destination
    // URL itself. Just drop the users takeover; don't touch history.
    setPage("library");
  };

  return (
    <Library
      startIndexingOnMount={false}
      headerSlot={headerSlot}
      showUsers={page === "users" && isAdmin}
      onCloseUsers={closeUsers}
      onLeaveUsers={leaveUsers}
    />
  );
}

interface UserMenuProps {
  buttonStyle: React.CSSProperties;
  menuOpen: boolean;
  setMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  email: string;
  role: string;
  isAdmin: boolean;
  page: "library" | "users";
  onGoToUsers: () => void;
}

/**
 * Portal-rendered avatar dropdown. Anchored to the button's bounding rect so
 * it floats over any clipping ancestor (the sidebar has overflow:hidden so an
 * inline absolute-positioned dropdown gets cut off). Outside-click is handled
 * locally against both the button and the portal menu so the existing parent
 * handler (which only checks the button container) doesn't close it instantly.
 */
function UserMenu({
  buttonStyle,
  menuOpen,
  setMenuOpen,
  email,
  role,
  isAdmin,
  page,
  onGoToUsers,
}: UserMenuProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Flip menu direction based on available space. Desktop sidebar puts
    // the avatar at the bottom-left → menu floats UP. Mobile puts it in
    // the top navbar → there's no room above so the menu must float DOWN.
    const menuWidth = 220;
    const menuMaxHeight = 240;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeBelow = spaceAbove < menuMaxHeight + 16 && spaceBelow >= spaceAbove;
    const top = placeBelow
      ? Math.min(window.innerHeight - menuMaxHeight - 8, rect.bottom + 8)
      : Math.max(8, rect.top - menuMaxHeight - 8);
    const left = Math.max(
      8,
      Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth),
    );
    setAnchor({ top, left });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    // Use `click` (not `mousedown`) so the menu doesn't close before the
    // click on a menu item can complete its handler. Also `mousedown` raced
    // against the menu-item click which made "Gestionar usuarios" appear to
    // do nothing.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuOpen, setMenuOpen]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        onClick={() => setMenuOpen((v) => !v)}
        style={buttonStyle}
        title={email}
      >
        {email.charAt(0).toUpperCase()}
      </button>

      {menuOpen && anchor &&
        createPortal(
          <div
            ref={portalRef}
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow:
                "0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
              width: 220,
              zIndex: 200,
              padding: "4px",
            }}
          >
            <div
              style={{
                padding: "10px 12px 8px",
                borderBottom: "1px solid var(--color-border)",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text)",
                  marginBottom: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={email}
              >
                {email}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {role}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                gap: 8,
              }}
            >
              <span
                style={{ fontSize: 13, color: "var(--color-text-muted)" }}
              >
                Tema
              </span>
              <ThemeToggle />
            </div>

            {isAdmin && (
              <>
                <div
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    margin: "4px 0",
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToUsers();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background:
                      page === "users"
                        ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
                        : "none",
                    border: "none",
                    borderRadius: "6px",
                    color:
                      page === "users"
                        ? "var(--color-primary)"
                        : "var(--color-text)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Gestionar usuarios
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        background: "var(--color-bg)",
      }}
    >
      {/* Wordmark */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "var(--color-text)",
          fontFamily: "var(--font-sans)",
          userSelect: "none",
        }}
      >
        osc
        <span style={{ color: "var(--color-primary)" }}>ata</span>
      </div>

      {/* Spinner ring */}
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        style={{ animation: "spin 0.9s linear infinite" }}
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          stroke="var(--color-border)"
          strokeWidth="3"
        />
        <path
          d="M18 3 A15 15 0 0 1 33 18"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
