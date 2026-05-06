import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // GitHub Pages deploys at /<repo>/, so the workflow sets BASE_PATH to that.
  // Local dev and root-domain hosts leave it unset and serve from "/".
  base: process.env.BASE_PATH || "/",
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("./src/engine", import.meta.url)),
      "@themes": fileURLToPath(new URL("./src/themes", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
