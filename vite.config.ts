import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Keep render-isolation tests independent of compiler memoization.
    mode !== "test" && babel({ presets: [reactCompilerPreset()] }),
    {
      name: "yandex-metrika",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { type: "text/javascript" },
            injectTo: "head",
            children: `
              (function(m,e,t,r,i,k,a){
                  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                  m[i].l=1*new Date();
                  for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=113396197', 'ym');

              ym(113396197, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
            `
          },
          {
            tag: "noscript",
            injectTo: "body-prepend",
            children:
              '<div><img src="https://mc.yandex.ru/watch/113396197" style="position:absolute; left:-9999px;" alt="" /></div>'
          }
        ];
      }
    }
  ],
  // The build moment for the settings' "About" section; the commit comes from VITE_GIT_SHA.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  // `host: true` listens on every interface, so the page opens by LAN address too.
  server: { port: 5190, host: true },
  // Test only product source, not copies cached by pnpm or agents' worktrees.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/.worktrees/**", "tools/**"]
  }
}));
