import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes HTTP reais: sobem o app COMPILADO (next build) contra nexo_test e falam com ele por fetch.
// Nunca tocam dev ou producao (scripts/iniciar-app-teste.mjs recusa outro banco).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/http/**/*.test.ts"],
    globalSetup: ["tests/http/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
