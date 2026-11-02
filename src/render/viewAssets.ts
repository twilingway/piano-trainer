import type { FxLayer } from "./FxLayer";
import type { HandsLayer } from "./HandsLayer";
import type { NotesLayer } from "./NotesLayer";
import type { RoadLayer } from "./RoadLayer";

/** Offline fonts may fail; the HUD can render using its fallback face. */
export async function loadViewFonts(): Promise<void> {
  const stylesheet = document.getElementById("app-fonts") as HTMLLinkElement | null;
  if (stylesheet && !stylesheet.sheet && stylesheet.dataset.startupSettled !== "true") {
    await new Promise<void>((resolve) => {
      const settled = () => {
        stylesheet.removeEventListener("load", settled);
        stylesheet.removeEventListener("error", settled);
        resolve();
      };
      stylesheet.addEventListener("load", settled);
      stylesheet.addEventListener("error", settled);
    });
  }
  await Promise.all([
    document.fonts.load("34px 'Russo One'"),
    document.fonts.load("700 20px Manrope")
  ]).catch(() => undefined);
}

export async function loadViewAssets(
  fx: FxLayer,
  notes: NotesLayer,
  road: RoadLayer,
  hands: HandsLayer
): Promise<void> {
  await Promise.all([fx.load(), notes.loadNeon(), road.loadArrivalEffects(), hands.load()]);
}
