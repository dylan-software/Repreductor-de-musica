import { defineConfig } from "vite";

// A relative base makes the build work on any static host
// (Vercel, Netlify, Cloudflare Pages, GitHub Pages sub-paths, ...).
//
// strictPort: IndexedDB is stored PER ORIGIN (protocol + host + port). If Vite
// silently moved to another port (5174, 5175...) the app would open an empty
// database and the saved songs/accounts would seem to have disappeared.
// With strictPort Vite fails loudly instead of changing the port.
export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  test: {
    environment: "node",
  },
});
