import type { Locale } from "../i18n/locales.ts";
import { startupMessages } from "../i18n/startupMessages.ts";
import { appMessages } from "../i18n/appMessages.ts";
import { translate } from "../i18n/translate.ts";

const criticalCss = `
:root { --startup-bg: #020c18; --startup-ink: #e9f3f8; --startup-muted: #7f9ba9; --startup-accent: #41d5ec; }
html.piano-booting, html.piano-booting body { margin: 0; min-height: 100%; background: var(--startup-bg); }
.piano-booting #root { visibility: hidden; }
#piano-startup { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
  overflow: auto; box-sizing: border-box; padding: 32px 20px; color: var(--startup-ink);
  background: radial-gradient(ellipse at 50% 40%, #102834 0, #06131f 38%, var(--startup-bg) 75%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: center; }
.startup-content { width: min(100%, 380px); padding: 28px 0; }
.startup-brand { margin: 0 0 44px; color: var(--startup-muted); font-size: 11px;
  font-weight: 600; letter-spacing: .25em; text-transform: uppercase; }
.startup-piano { position: relative; display: flex; gap: 3px; width: 224px; height: 112px;
  margin: 0 auto 36px; padding: 10px 8px 8px; box-sizing: border-box; border-radius: 8px;
  border-top: 2px solid #24424e; background: #08121a; box-shadow: 0 18px 55px #0009, 0 0 46px #41d5ec0c; }
.startup-key { flex: 1; position: relative; border-radius: 0 0 4px 4px;
  background: linear-gradient(#f4f3eb, #d1dce0); box-shadow: inset 0 -5px 0 #9bafb8;
  transform-origin: 50% 0; animation: startup-key-press 2.4s ease-in-out infinite;
  animation-delay: calc(var(--key) * .13s); }
.startup-key::after { content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(#41d5ec00, #41d5ec); opacity: 0; animation: startup-key-glow 2.4s ease-in-out infinite;
  animation-delay: calc(var(--key) * .13s); }
.startup-black { position: absolute; top: 10px; z-index: 1; width: 18px; height: 57px;
  left: calc(8px + var(--position) * 30px - 9px); border-radius: 0 0 3px 3px;
  background: linear-gradient(100deg, #263641, #080e15 65%); border: 1px solid #050b11;
  box-shadow: inset 0 -5px 0 #050b11, 2px 3px 3px #0005; }
#startup-title { font-size: clamp(20px, 5.8vw, 25px); font-weight: 600; letter-spacing: -.035em; margin: 0 0 9px; }
#startup-stage { margin: 0; font-size: 13px; color: #a8bbc5; line-height: 1.5; }
.startup-rule { height: 1px; width: 160px; margin: 26px auto 20px; background: #203744; overflow: hidden; }
.startup-rule::after { content: ""; display: block; width: 44%; height: 100%; background: var(--startup-accent);
  box-shadow: 0 0 8px var(--startup-accent); animation: startup-scan 1.8s ease-in-out infinite; }
.startup-data { font-size: 11px; color: var(--startup-muted); font-variant-numeric: tabular-nums; line-height: 1.8; }
.startup-data p { margin: 0; }
#startup-remaining { color: #a8bbc5; margin-top: 7px; }
#startup-known { min-height: 20px; }
#startup-reload { margin-top: 22px; min-height: 44px; padding: 10px 20px; border-radius: 7px;
  border: 1px solid #41d5ec70; background: #12313d; color: var(--startup-ink); font: inherit; cursor: pointer; }
#startup-reload[hidden] { display: none; }
#startup-reload:focus-visible { outline: 2px solid var(--startup-accent); outline-offset: 4px; }
.startup-failed .startup-key, .startup-failed .startup-key::after, .startup-failed .startup-rule::after { animation: none; }
@keyframes startup-key-press { 0%, 9%, 33%, 100% { transform: scaleY(1); } 16%, 25% { transform: scaleY(.95); } }
@keyframes startup-key-glow { 0%, 8%, 38%, 100% { opacity: 0; } 17%, 24% { opacity: .85; } }
@keyframes startup-scan { from { transform: translateX(-110%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) {
  .startup-key, .startup-key::after, .startup-rule::after { animation: none; }
  .startup-key:nth-child(3)::after { opacity: .45; }
}
@media (max-height: 620px) {
  #piano-startup { padding: 12px 16px; }
  .startup-content { padding: 0; }
  .startup-brand { margin-bottom: 8px; }
  .startup-piano { height: 64px; padding-top: 6px; margin-bottom: 10px; }
  .startup-black { top: 6px; height: 34px; }
  #startup-title { font-size: 20px; margin-bottom: 5px; }
  #startup-stage { font-size: 12px; line-height: 1.4; }
  .startup-rule { margin: 10px auto 8px; }
  .startup-data { line-height: 1.45; }
  #startup-remaining { margin-top: 4px; }
  #startup-known { min-height: 0; }
  #startup-reload { margin-top: 10px; }
}
@media (max-height: 340px) {
  #piano-startup { padding-block: 8px; }
  .startup-brand { display: none; }
  .startup-piano { height: 48px; margin-bottom: 6px; }
  .startup-black { height: 25px; }
  #startup-title { font-size: 18px; }
  .startup-rule { margin: 8px auto 6px; }
}
`;

export function startupShell(locale: Locale): string {
  const t = (message: string) => translate(locale, { ...appMessages, ...startupMessages }, message);
  const keys = Array.from(
    { length: 7 },
    (_, i) => `<i class="startup-key" style="--key:${String(i)}"></i>`
  ).join("");
  const black = [1, 2, 4, 5, 6]
    .map((i) => `<i class="startup-black" style="--position:${String(i)}"></i>`)
    .join("");
  return `<style id="piano-startup-style">${criticalCss}</style>
<div id="piano-startup" lang="${locale}">
  <div class="startup-content">
    <p id="startup-brand" class="startup-brand">${t("Нотопад")}</p>
    <div class="startup-piano" aria-hidden="true">${keys}${black}</div>
    <div role="status" aria-live="polite" aria-atomic="true">
      <h1 id="startup-title">${t("Загружаем пианино")}</h1>
      <p id="startup-stage">${t("Готовим сцену и ноты")}</p>
    </div>
    <div class="startup-rule" aria-hidden="true"></div>
    <div class="startup-data">
      <p id="startup-estimate"></p><p id="startup-resources"></p><p id="startup-network"></p>
      <p id="startup-remaining">${t("Осталось: уточняется")}</p><p id="startup-known"></p>
    </div>
    <button id="startup-reload" type="button" hidden>${t("Перезагрузить страницу")}</button>
    <noscript><p>${t("Для запуска пианино включите JavaScript")}</p></noscript>
  </div>
</div>`;
}
