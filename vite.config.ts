import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  // The collab plugin imports the bare `prosemirror-*` packages while Tiptap
  // imports them via `@tiptap/pm/*`. Both must resolve to a single copy of each
  // or `Step`/`Schema`/`instanceof` checks straddle two module instances and
  // silently break collab. Dedupe forces one copy (client and Worker bundles).
  resolve: {
    dedupe: [
      "prosemirror-state",
      "prosemirror-model",
      "prosemirror-view",
      "prosemirror-transform",
      "prosemirror-keymap",
      "prosemirror-commands",
      "prosemirror-history",
      "prosemirror-inputrules",
      "prosemirror-gapcursor",
      "prosemirror-dropcursor",
      "prosemirror-schema-list",
    ],
  },
  plugins: [
    tailwindcss(),
    solid(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
      devOptions: {
        enabled: false,
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
      },
      manifest: {
        name: "tldraft",
        short_name: "tldraft",
        description: "Collaborative docs editor",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        orientation: "portrait",
        id: "tldraft",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        categories: ["productivity", "publishing"],
      },
    }),
    cloudflare(),
  ],
});
