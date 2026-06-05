import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    VitePWA({
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "Drafts",
        short_name: "Drafts",
        description: "Collaborative drafts editor",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
      },
      registerType: "autoUpdate",
    }),
  ],
});
