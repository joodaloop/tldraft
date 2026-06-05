import { A, Route, Router } from "@solidjs/router";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import { PagesProvider } from "./stores/pages";

function App() {
  return (
    <Router
      root={(props) => (
        <PagesProvider>
          <header class="site-header">
            <A href="/" class="brand">
              Drafts
            </A>
            <nav aria-label="Primary navigation">
              <A href="/draft/welcome">Draft</A>
              <A href="/login">Login</A>
              <A href="/settings">Settings</A>
            </nav>
          </header>
          {props.children}
        </PagesProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/draft/:id" component={Draft} />
      <Route path="/login" component={Login} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
