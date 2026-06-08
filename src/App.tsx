import { Route, Router, useLocation, useParams } from "@solidjs/router";
import { createEffect, type JSX } from "solid-js";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import { PagesProvider } from "./stores/pages";

function AppLayout(props: { children?: JSX.Element }) {
  const params = useParams();
  const location = useLocation();

  createEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = location.pathname === "/" ? "index,follow" : "noindex,nofollow";
  });

  return (
    <PagesProvider>
      <div class="flex bg-background">
        <Sidebar activeId={params.id} />
        <div class="w-full h-dvh overflow-auto">{props.children}</div>
      </div>
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
