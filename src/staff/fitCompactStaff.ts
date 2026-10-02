import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

/** Fit one complete system into the CSS height limit without changing the saved zoom. */
export function fitCompactStaff(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  first: { readonly top: number; readonly bottom: number } | undefined
): void {
  const style = getComputedStyle(host);
  if (!first || style.getPropertyValue("--staff-fit").trim() !== "1") return;
  const limit = Number.parseFloat(style.maxHeight);
  const scrollbar = host.offsetHeight - host.clientHeight;
  const lineHeight = first.bottom - first.top;
  const room = Math.max(0, limit - 4 - scrollbar - 2);
  if (Number.isFinite(limit) && lineHeight > room && room > 0) {
    osmd.Zoom *= room / lineHeight;
    osmd.render();
  }
}
