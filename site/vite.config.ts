import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      mdenc: resolve(__dirname, "../src/crypto/index.ts"),
    },
  },
  build: {
    outDir: "dist",
  },
});
