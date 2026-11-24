import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes de integracao: rodam contra o banco nexo_test (PostgreSQL local), nunca contra dev ou producao.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
