import { spotAt } from "../staff/liveCursor";
import type { ReaderGeometry } from "../staff/readerGeometry";
import type { TabModel, TabRow } from "./pianoTabsLayout";

/** Wrapped scores can compress their engraving; labels must stay inside neighbouring attacks. */
export function scoreTabLabelSize(
  row: TabRow,
  left: number,
  hand: "left" | "right",
  label: string,
  zoom: number
): number {
  const gap = Math.min(
    ...row.events
      .filter((entry) => entry.attack && entry.event.hand === hand && entry.left !== left)
      .map((entry) => Math.abs(entry.left - left))
  );
  // IBM Plex Mono uses a 0.6em advance; reserve padding and a visible gap on both sides.
  return Math.min(26 * zoom, Math.max(1, gap - 8) / (label.length * 0.6));
}

/** Geometry supplies pixels only; the song remains the source of attacks and releases. */
export function layoutTabsOnScore(model: TabModel, geometry: ReaderGeometry): readonly TabRow[] {
  return geometry.systems.map((system) => {
    const spots = geometry.spots.filter((spot) => spot.line === system.line);
    // A duration reaches the final barline; the live cursor retains the staff's own anchors.
    const durationSpots = [...spots, { beat: system.endBeat, x: system.width, line: system.line }];
    const xAt = (beat: number) => spotAt(durationSpots, beat)?.x ?? 0;
    const boundaries = [
      ...new Set([
        system.startBeat,
        ...model.boundaries.filter((beat) => beat > system.startBeat && beat < system.endBeat),
        ...spots.map((spot) => spot.beat),
        system.endBeat
      ])
    ].sort((a, b) => a - b);
    return {
      startBeat: system.startBeat,
      endBeat: system.endBeat,
      boundaries,
      offsets: boundaries.map(xAt),
      width: system.width,
      cursorSpots: spots,
      barlines: system.barlines,
      events: model.events
        .filter((event) => event.startBeat < system.endBeat && event.endBeat > system.startBeat)
        .map((event) => {
          const left = xAt(Math.max(system.startBeat, event.startBeat));
          return {
            event,
            left,
            width: xAt(Math.min(system.endBeat, event.endBeat)) - left,
            attack: event.startBeat >= system.startBeat
          };
        })
    };
  });
}
