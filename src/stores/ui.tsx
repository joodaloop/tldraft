import {
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";
const MOBILE_SIDEBAR_QUERY = "(max-width: 767px)";

export interface UIState {
  sidebarOpen: Accessor<boolean>;
  sidebarReady: Accessor<boolean>;
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
  const [mobile, setMobile] = createSignal(isMobileSidebar());
  const [sidebarOpen, setSidebarOpen] = createSignal(!isMobileSidebar());
  const [sidebarReady, setSidebarReady] = createSignal(false);

  const mount = () => onMount(() => {
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

  const toggleSidebar = () => {
    setSidebarOpen((value) => {
      const next = !value;
      if (!mobile()) {
        try {
          localStorage.setItem(COLLAPSED_STORAGE_KEY, String(!next));
        } catch {
          // Ignore storage failures; the signal still updates.
        }
      }
      return next;
    });
  };

  return {
    sidebarOpen,
    sidebarReady,
    toggleSidebar,
    closeSidebarIfMobile,
    mount,
  };
}

export const ui = createUIState();
