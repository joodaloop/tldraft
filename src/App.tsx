import { Route, Router, useLocation, useParams } from "@solidjs/router";
import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Share from "./pages/Share";
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

      if (commandOnly && key === ".") {
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
    <div class="relative flex h-dvh overflow-hidden bg-background">
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
        <SidebarIcon />
      </button>
      <Sidebar activeId={params.id} />
      <div
        class="min-w-0 flex-1 h-dvh overflow-y-auto overscroll-contain transition-[padding-left] duration-200 ease-out"
        classList={{ "md:pl-[var(--container-3xs)]": ui.sidebarOpen() }}
      >
        {props.children}
      </div>
    </div>
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
      <Route path="/share/:id" component={Share} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
