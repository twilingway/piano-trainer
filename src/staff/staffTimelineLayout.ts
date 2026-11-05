import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { BeatSpot } from "./liveCursor";
import type { StaffProps } from "./staffProps";
import { installUniformStaffLayout } from "./uniformStaffLayout";
import { timelineSpots, type StaffTimeAxis } from "./staffTimelineSpots";
import { scrollTarget, type LineBox } from "./staffViewport";

/** Existing layout composition: unchanged beat/tempo boundaries, with no independent time source. */
export function layoutStaffTimeline(
  osmd: OpenSheetMusicDisplay,
  axis: StaffTimeAxis | undefined,
  timeline: StaffProps["timeline"],
  entries: BeatSpot[],
  lines: readonly LineBox[],
  offsetX = 0
): BeatSpot[] {
  const measures = osmd.Sheet.SourceMeasures;
  const first = measures[0];
  const last = measures.at(-1);
  if (!axis || !timeline || !first || !last) return entries;
  const spots = timelineSpots(
    axis,
    entries,
    [...timeline.beats, ...measures.map((measure) => measure.AbsoluteTimestamp.RealValue * 4)],
    first.AbsoluteTimestamp.RealValue * 4,
    (last.AbsoluteTimestamp.RealValue + last.Duration.RealValue) * 4,
    lines[0]?.top ?? 0
  );
  return offsetX === 0 ? spots : spots.map((spot) => ({ ...spot, x: spot.x + offsetX }));
}

/** One shared cursor-target policy for initial layout and follow steering. */
export function staffCursorTarget(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  lines: readonly LineBox[],
  singleLine: boolean
) {
  return scrollTarget(host, osmd.cursor.cursorElement, lines, singleLine);
}

/** Both readers use the same engraving hooks; only the melody course requests a continuous axis. */
export function installStaffTimeline(
  osmd: OpenSheetMusicDisplay,
  timeline: StaffProps["timeline"],
  enabled: boolean,
  horizontal: boolean,
  labelWidthAtBeat: (beat: number) => number,
  continuousTime: boolean
) {
  return timeline && enabled
    ? installUniformStaffLayout(osmd, timeline.timeAtBeat, {
        horizontal,
        labelWidthAtBeat,
        continuousTime
      })
    : undefined;
}
