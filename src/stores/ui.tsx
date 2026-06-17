import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";
const MOBILE_SIDEBAR_QUERY = "(max-width: 767px)";
export const DEFAULT_USERNAME = "anonymoose";

export interface UIState {
  username: Accessor<string>;
  setUsername: (username: string) => void;
  sidebarOpen: Accessor<boolean>;
  sidebarReady: Accessor<boolean>;
  openSidebar: () => void;
  toggleSidebar: () => void;
  closeSidebarIfMobile: () => void;
  mount: () => void;
}

function isMobileSidebar(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
}

function loadDesktopSidebarOpen(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

function createUIState(): UIState {
  const [username, setUsernameSignal] = createSignal(DEFAULT_USERNAME);
  const [mobile, setMobile] = createSignal(isMobileSidebar());
  const [sidebarOpen, setSidebarOpen] = createSignal(!isMobileSidebar());
  const [sidebarReady, setSidebarReady] = createSignal(false);

  const mount = () =>
    onMount(() => {
      const query = window.matchMedia(MOBILE_SIDEBAR_QUERY);
      const syncMode = () => {
        setMobile(query.matches);
        setSidebarOpen(query.matches ? false : loadDesktopSidebarOpen());
      };

      query.addEventListener("change", syncMode);
      syncMode();
      setSidebarReady(true);

      onCleanup(() => query.removeEventListener("change", syncMode));
    });

  const closeSidebarIfMobile = () => {
    if (mobile()) setSidebarOpen(false);
  };

  const rememberDesktopSidebarOpen = (open: boolean) => {
    if (mobile()) return;
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(!open));
    } catch {
      // Ignore storage failures; the signal still updates.
    }
  };

  const openSidebar = () => {
    setSidebarOpen(true);
    rememberDesktopSidebarOpen(true);
  };

  const setUsername = (nextUsername: string) => {
    setUsernameSignal(nextUsername);
    window.dispatchEvent(new Event("drafts:username-change"));
  };

  const toggleSidebar = () => {
    setSidebarOpen((value) => {
      const next = !value;
      rememberDesktopSidebarOpen(next);
      return next;
    });
  };

  return {
    username,
    setUsername,
    sidebarOpen,
    sidebarReady,
    openSidebar,
    toggleSidebar,
    closeSidebarIfMobile,
    mount,
  };
}

export const ui = createUIState();
