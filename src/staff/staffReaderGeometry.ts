import { VexFlowMeasure, unitInPixels, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

import type { BeatSpot } from "./liveCursor";
import type { ReaderGeometry, ReaderSystem } from "./readerGeometry";

interface MeasureGeometry {
  readonly line: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly left: number;
  readonly right: number;
  readonly leftBarline?: number;
  readonly rightBarline?: number;
}

function barlineX(
  stave: ReturnType<VexFlowMeasure["getVFStave"]>,
  position: 5 | 6,
  fallback: number
): number {
  // VexFlow 1.x exposes these methods at runtime, but StaveModifier declarations omit them.
  const modifier = stave.getModifiers(position, "barlines")[0] as unknown as
    { readonly getX?: () => number; readonly getType?: () => number } | undefined;
  const x = modifier?.getX?.() ?? fallback;
  const type = modifier?.getType?.();
  // VexFlow draws END's thin line and repeat endings at x - 5, not at the modifier's x.
  if (type === 3 || (position === 6 && (type === 5 || type === 6))) return x - 5;
  if (position === 5 && (type === 4 || type === 6)) return x + 3;
  return x;
}

/** Barlines are engraved measure edges, never interpolated note onsets. */
export function readerSystems(measures: readonly MeasureGeometry[]): ReaderSystem[] {
  const lines = new Map<number, MeasureGeometry[]>();
  for (const measure of measures) {
    const row = lines.get(measure.line) ?? [];
    row.push(measure);
    lines.set(measure.line, row);
  }
  return [...lines].map(([line, row]) => {
    row.sort((a, b) => a.startBeat - b.startBeat);
    const first = row[0];
    const last = row.at(-1);
    return {
      line,
      startBeat: first?.startBeat ?? 0,
      endBeat: last?.endBeat ?? 0,
      width: Math.max(...row.map((measure) => measure.right)),
      barlines: [
        ...(first ? [{ beat: first.startBeat, x: first.leftBarline ?? first.left }] : []),
        ...row.map((measure) => ({
          beat: measure.endBeat,
          x: measure.rightBarline ?? measure.right
        }))
      ]
    };
  });
}

/** Snapshot after OSMD has rendered and the page has been fitted/centred. */
export function readStaffGeometry(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  spots: readonly BeatSpot[],
  lines: readonly { readonly top: number }[]
): ReaderGeometry {
  const pixels = unitInPixels * osmd.Zoom;
  const measures: MeasureGeometry[] = [];
  const systems = osmd.GraphicSheet.MusicPages[0]?.MusicSystems ?? [];
  for (const [index, system] of systems.entries()) {
    for (const row of system.GraphicalMeasures) {
      // Measure rows can have holes for hidden or missing staves.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const measure = row.find((candidate) => candidate && !candidate.IsExtraGraphicalMeasure);
      if (!measure) continue;
      const source = measure.parentSourceMeasure;
      const startBeat = source.AbsoluteTimestamp.RealValue * 4;
      const box = measure.PositionAndShape;
      const stave = measure instanceof VexFlowMeasure ? measure.getVFStave() : undefined;
      measures.push({
        line: lines[index]?.top ?? system.PositionAndShape.AbsolutePosition.y * pixels,
        startBeat,
        endBeat: startBeat + source.Duration.RealValue * 4,
        // VexFlow stave bounds are in unzoomed pixels; the SVG renderer applies Zoom.
        left: stave ? stave.getX() * osmd.Zoom : box.AbsolutePosition.x * pixels,
        right: stave
          ? (stave.getX() + stave.getWidth()) * osmd.Zoom
          : (box.AbsolutePosition.x + box.Size.width) * pixels,
        ...(stave
          ? {
              leftBarline: barlineX(stave, 5, stave.getX()) * osmd.Zoom,
              rightBarline: barlineX(stave, 6, stave.getX() + stave.getWidth()) * osmd.Zoom
            }
          : {})
      });
    }
  }
  const svg = host.querySelector("svg");
  return {
    spots: spots.map((spot) => ({ ...spot })),
    systems: readerSystems(measures),
    svgOffsetX: svg
      ? svg.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft
      : 0,
    viewportWidth: host.getBoundingClientRect().width
  };
}
