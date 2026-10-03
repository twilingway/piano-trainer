import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // `host: true` listens on every interface, so the page opens by LAN address too.
  server: { port: 5190, host: true },
  // Test only product source, not copies cached by pnpm or agents' worktrees.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/.worktrees/**", "tools/**"]
  }
});
