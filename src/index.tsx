/* @refresh reload */
import { render } from "solid-js/web";
import "./pwa";
import "./assets/index.css";
import "./assets/tiptap.css";
import App from "./App.tsx";

const root = document.getElementById("root");

render(() => <App />, root!);
