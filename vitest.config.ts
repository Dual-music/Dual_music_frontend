import path from "path";

import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the frontend.
 *
 * Component tests run in jsdom with Testing Library; the `@/` alias mirrors
 * `vite.config.ts` so imports resolve identically to the app build. The global
 * setup file registers jest-dom matchers and cleans the DOM between tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/test/**",
        "src/main.tsx",
        "src/**/*.test.{ts,tsx}",
      ],
    },
  },
});
