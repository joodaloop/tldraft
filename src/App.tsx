import { Route, Router, useLocation, useParams } from "@solidjs/router";
import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import { PagesProvider } from "./stores/pages";
import { ui } from "./stores/ui";

function AppShell(props: { children?: JSX.Element }) {
  const params = useParams();

  ui.mount();

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        ui.toggleSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return (
    <div class="flex bg-background">
      <Sidebar activeId={params.id} />
      <div class="w-full h-dvh overflow-auto">{props.children}</div>
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
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
