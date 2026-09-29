import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // `host: true` listens on every interface, so the page opens by LAN address too.
  server: { port: 5190, host: true }
});
