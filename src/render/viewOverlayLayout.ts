/** Share the renderer's layout with DOM overlays without another clock or frame measurements. */
export function publishOverlayLayout(
  host: HTMLElement | null,
  hitLine: number,
  keysBottom: number,
  hudTop: number
): void {
  if (!host) return;
  host.style.setProperty("--hit-line", `${String(hitLine)}px`);
  host.style.setProperty("--keys-bottom", `${String(keysBottom)}px`);
  host.style.setProperty("--game-hud-top", `${String(hudTop)}px`);
  host.dataset.gameHudLayout = hitLine - hudTop < 280 ? "compact" : "stacked";
}
