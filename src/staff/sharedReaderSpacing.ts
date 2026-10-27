import type { SongNote } from "../song/song";

const LETTERS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const RUSSIAN = ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"];

export interface SharedTabLabels {
  readonly notes: readonly SongNote[];
  readonly noteNames: "off" | "ru" | "en";
  readonly zoom: number;
}

/** The tab font is monospace: glyph advance is 0.6em, plus its CSS side padding. */
export function sharedTabLabelWidths(
  labels: SharedTabLabels | undefined,
  scale = 1
): ReadonlyMap<number, number> {
  const widths = new Map<number, number>();
  if (!labels) return widths;
  const names = labels.noteNames === "ru" ? RUSSIAN : LETTERS;
  for (const note of labels.notes) {
    const name = names[((note.pitch % 12) + 12) % 12] ?? "C";
    const width = name.length * 0.6 * 26 * labels.zoom * scale + 4;
    widths.set(note.startBeat, Math.max(widths.get(note.startBeat) ?? 0, width));
  }
  return widths;
}

/** Both readers use the presentation scale already resolved by the tab's CSS. */
export function sharedTabScale(host: HTMLElement): number {
  const tabs = host.closest(".course-score-stack")?.querySelector(".piano-tabs");
  if (!tabs) return 1;
  const scale = Number.parseFloat(getComputedStyle(tabs).getPropertyValue("--tabs-scale"));
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
