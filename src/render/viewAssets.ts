import type { FxLayer } from "./FxLayer";
import type { HandsLayer } from "./HandsLayer";
import type { NotesLayer } from "./NotesLayer";
import type { RoadLayer } from "./RoadLayer";

/** Offline fonts may fail; the HUD can render using its fallback face. */
export async function loadViewFonts(): Promise<void> {
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
