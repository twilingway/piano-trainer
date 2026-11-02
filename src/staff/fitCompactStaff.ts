import { STAFF_VERTICAL_SPACE } from "./staffSpacing";
import { fitWrappedStaff } from "./fitWrappedStaff";
import { lineBoxes } from "./staffViewport";
import { VexFlowMeasure, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

/** Apply the viewport scale while keeping the user's preference unchanged. */
export function staffZoom(host: HTMLElement, zoom: number): number {
  const scale = Number.parseFloat(getComputedStyle(host).getPropertyValue("--staff-scale")) || 1;
  return zoom * scale;
}

/** Fit defines 100%; apply the independent manual scale after that baseline fit. */
export function fitCompactStaff(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  first: { readonly top: number; readonly bottom: number } | undefined,
  zoom = 1
): void {
  const style = getComputedStyle(host);
  const original = osmd.Zoom;
  const limit = Number.parseFloat(style.maxHeight);
  const scrollbar = host.offsetHeight - host.clientHeight;
  const lineHeight = first ? first.bottom - first.top : 0;
  const room = Math.max(
    0,
    limit - STAFF_VERTICAL_SPACE.top - STAFF_VERTICAL_SPACE.bottom - scrollbar - 2
  );
  if (
    style.getPropertyValue("--staff-fit").trim() === "1" &&
    Number.isFinite(limit) &&
    lineHeight > room &&
    room > 0
  )
    osmd.Zoom *= room / lineHeight;
  osmd.Zoom *= zoom;
  if (osmd.Zoom !== original) osmd.render();
}

/** A shared label can make one wrapped measure wider than OSMD's nominal page. */
export function fitWrappedStaffSvg(osmd: OpenSheetMusicDisplay): void {
  for (const backend of osmd.Drawer.Backends) {
    const svg = backend.getRenderElement().querySelector("svg");
    if (!svg) continue;
    let right = 0;
    for (const system of backend.graphicalMusicPage.MusicSystems) {
      for (const row of system.GraphicalMeasures) {
        for (const measure of row) {
          if (!(measure instanceof VexFlowMeasure)) continue;
          const stave = measure.getVFStave();
          right = Math.max(right, (stave.getX() + stave.getWidth()) * osmd.Zoom);
        }
      }
    }
    // SVG ink includes ledger lines, accidentals and labels beyond a stave edge.
    const ink = (svg as { getBBox?: () => { x: number; width: number } }).getBBox?.();
    if (ink) right = Math.max(right, (ink.x + ink.width) * osmd.Zoom);
    const width = Math.ceil(right + 2);
    // Backend.resize preserves the existing context scale when updating its viewBox.
    if (width > backend.width) backend.resize(width, backend.height);
  }
}

interface StaffZoomOptions {
  readonly zoom: number;
  readonly singleLine: boolean;
  readonly breaksFromScore: boolean;
  readonly maxShare: number;
}

/** A fitted glyph size belongs to the score/viewport, never to mutable tab layout. */
export class StaffZoomBaseline {
  // Staff creates a new OSMD instance whenever the source XML or engraving mode changes.
  private readonly fits = new WeakMap<OpenSheetMusicDisplay, { key: string; zoom: number }>();

  render(osmd: OpenSheetMusicDisplay, host: HTMLElement, options: StaffZoomOptions): void {
    const style = getComputedStyle(host);
    const workspace = host.closest(".workspace-main");
    const staves = host.closest(".staves");
    // Read the outer workspace, not clientWidth: tab overflow can toggle a 15px scrollbar.
    const width = workspace?.getBoundingClientRect().width ?? host.getBoundingClientRect().width;
    const key = JSON.stringify([
      window.innerWidth,
      window.innerHeight,
      width,
      style.maxHeight,
      style.getPropertyValue("--staff-scale"),
      style.getPropertyValue("--staff-fit"),
      options.singleLine,
      options.breaksFromScore,
      options.maxShare,
      staves?.className,
      staves?.children.length
    ]);
    const previous = this.fits.get(osmd);
    if (previous?.key === key) osmd.Zoom = previous.zoom;
    else {
      osmd.Zoom = staffZoom(host, 1);
      osmd.render();
      if (!options.singleLine && options.breaksFromScore) fitWrappedStaff(osmd);
      fitCompactStaff(osmd, host, lineBoxes(osmd)[0]);
      this.fits.set(osmd, { key, zoom: osmd.Zoom });
    }
    osmd.Zoom *= options.zoom;
    osmd.render();
  }
}
