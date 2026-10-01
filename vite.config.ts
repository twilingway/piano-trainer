import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // `host: true` listens on every interface, so the page opens by LAN address too.
  server: { port: 5190, host: true },
  // Agents' worktrees are full copies of the repository: their tests are not ours.
  test: { exclude: [...configDefaults.exclude, ".claude/**", "tools/**"] }
});
