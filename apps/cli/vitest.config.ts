import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.vitest.test.ts"],
    exclude: ["dist/**"],
  },
});
