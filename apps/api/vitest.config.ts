import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/services/**/*.ts"],
      all: true,
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.unit.test.ts",
        "src/**/*.integration.test.ts",
        "tests/**/*.ts"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80
      }
    }
  }
});
