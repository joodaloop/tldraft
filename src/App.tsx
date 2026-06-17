import { Route, Router, useLocation, useParams } from "@solidjs/router";
import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import { SidebarIcon } from "./components/icons";
import { PagesProvider } from "./stores/pages";
import { ui } from "./stores/ui";

function AppShell(props: { children?: JSX.Element }) {
  const params = useParams();

  ui.mount();

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const commandOnly = event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;

      if (commandOnly && key === "b") {
        event.preventDefault();
        ui.toggleSidebar();
      }

      if (commandOnly && key === "k") {
        event.preventDefault();
        ui.openSidebar();
        requestAnimationFrame(() => window.dispatchEvent(new Event("drafts:focus-sidebar-search")));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return (
    <div class="relative flex bg-background">
      <button
        type="button"
        aria-label="Show sidebar"
        aria-expanded={ui.sidebarOpen()}
        onClick={ui.toggleSidebar}
        class="fixed top-2 left-2 z-30 flex w-7 items-center justify-center bg-background p-1 transition-opacity"
        classList={{
          "opacity-0 pointer-events-none": ui.sidebarOpen(),
          "opacity-40 hover:opacity-100": !ui.sidebarOpen(),
        }}
      >
        <SidebarToggleIcon />
      </button>
      <Sidebar activeId={params.id} />
      <div class="w-full h-dvh overflow-auto">{props.children}</div>
    </div>
  );
}

function SidebarToggleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="icon icon-tabler icons-tabler-outline icon-tabler-layout-sidebar"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
      <path d="M9 4l0 16" />
    </svg>
  );
}

function AppLayout(props: { children?: JSX.Element }) {
  const location = useLocation();

  createEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = location.pathname === "/" ? "index,follow" : "noindex,nofollow";
  });

  return (
    <PagesProvider>
      <AppShell>{props.children}</AppShell>
    </PagesProvider>
  );
}

function App() {
  return (
    <Router root={(props) => <AppLayout>{props.children}</AppLayout>}>
      <Route path="/" component={Home} />
      <Route path="/draft/:id" component={Draft} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
