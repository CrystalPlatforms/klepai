import { defineConfig } from "vite";
import { cpSync, mkdirSync } from "node:fs";

// The loader pages live in ./loaders so a plain static server
// (python3 -m http.server) can serve them at /loaders/*.html.
// This plugin copies them into dist/ on build, like public/ used to.
export default defineConfig({
  plugins: [
    {
      name: "copy-loaders",
      closeBundle() {
        mkdirSync("dist/loaders", { recursive: true });
        cpSync("loaders", "dist/loaders", { recursive: true });
      },
    },
  ],
});
