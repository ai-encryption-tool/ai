import { defineConfig } from "vite";

const backendUrl = process.env.VITE_API_URL || process.env.BACKEND_URL || "http://127.0.0.1:7065";

export default defineConfig({
  cacheDir: ".vite-cache",
  server: {
    proxy: {
      "/health": backendUrl,
      "/auth": backendUrl,
      "/memories": backendUrl,
      "/memory": backendUrl,
      "/imports": backendUrl
    }
  }
});
