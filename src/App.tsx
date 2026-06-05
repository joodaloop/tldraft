import { Route, Router, useParams } from "@solidjs/router";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import { PagesProvider } from "./stores/pages";

function AppLayout(props: { children?: import("solid-js").JSX.Element }) {
  const params = useParams();

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
      <Route path="/login" component={Login} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
