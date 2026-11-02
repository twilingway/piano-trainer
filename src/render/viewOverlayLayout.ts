/** Share the renderer's layout with DOM overlays without another clock or frame measurements. */
export function publishOverlayLayout(
  host: HTMLElement | null,
  hitLine: number,
  keysBottom: number,
  hudTop: number,
  requiredHeight?: number,
  keysHeight?: number
): void {
  if (!host) return;
  host.style.setProperty("--hit-line", `${String(hitLine)}px`);
  host.style.setProperty("--keys-bottom", `${String(keysBottom)}px`);
  if (keysHeight !== undefined) host.style.setProperty("--keys-height", `${String(keysHeight)}px`);
  host.style.setProperty("--game-hud-top", `${String(hudTop)}px`);
  host.dataset.gameHudLayout = hitLine - hudTop < 280 ? "compact" : "stacked";
  const lanes = host.closest<HTMLElement>(".lanes");
  if (!lanes) return;
  const value =
    requiredHeight === undefined ? "" : `${String(Math.ceil(Math.max(0, requiredHeight)))}px`;
  if (lanes.style.getPropertyValue("--piano-required-height") === value) return;
  if (value) lanes.style.setProperty("--piano-required-height", value);
  else lanes.style.removeProperty("--piano-required-height");
  lanes.dispatchEvent(
    new CustomEvent("piano-layout-footprint", {
      bubbles: true,
      detail: { requiredHeight: requiredHeight ?? 0 }
    })
  );
}
