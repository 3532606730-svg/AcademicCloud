import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { pdfAssetsPlugin } from "./pdf-assets-plugin";

export default defineConfig({
  plugins: [react(), pdfAssetsPlugin()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    restoreMocks: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
