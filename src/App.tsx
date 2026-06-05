import { A, Route, Router } from "@solidjs/router";
import Draft from "./pages/Draft";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

function App() {
  return (
    <Router
      root={(props) => (
        <>
          <header class="site-header">
            <A href="/" class="brand">
              Drafts
            </A>
            <nav aria-label="Primary navigation">
              <A href="/draft/welcome">Draft</A>
              <A href="/settings">Settings</A>
            </nav>
          </header>
          {props.children}
        </>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/draft/:id" component={Draft} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
