import { defineConfig } from "vitest/config";

// Unit tests for the frontend: pure helpers (*.test.ts next to the code they
// test). No DOM: they run in Node. `npm test` / `npx vitest` to watch.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
