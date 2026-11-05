import type { CSSProperties } from "react";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { StaffProps } from "./staffProps";
import { fitCourseDrawing, type InkSpan } from "./courseStaffView";
import { fitSongCourseLabelBounds, fitSongCourseRoom } from "./songCourseViewport";
import { applyStaffClayMaterial } from "./staffClayMaterial";
import { paintStaffFingerings, paintStaffNotes } from "./staffNoteColors";

interface DrawingOptions {
  readonly noteColor: string;
  readonly scoreColor: string;
  readonly palette: boolean;
  readonly material: StaffProps["material"];
  readonly fingerColors: StaffProps["fingerColors"];
  readonly course: boolean;
  readonly illustration: boolean;
  readonly span: InkSpan | undefined;
  readonly manualZoom: number;
}

/** Paint and crop once per layout; the manual multiplier follows the viewport baseline. */
export function fitStaffDrawing(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  options: DrawingOptions
): number {
  return fitSongCourseRoom(
    osmd,
    host,
    () => {
      paintStaffNotes(osmd, options.noteColor, options.palette);
      applyStaffClayMaterial(host, options.material === "clay", osmd);
      paintStaffFingerings(osmd, options.fingerColors, options.scoreColor);
      return (
        (options.course && !options.illustration ? fitCourseDrawing(host, options.span) : 0) +
        fitSongCourseLabelBounds(host)
      );
    },
    options.manualZoom
  );
}

/** A deliberate manual enlargement may scroll instead of being silently shrunk again. */
export function staffDrawingOverflow(
  course: boolean,
  zoom: number,
  melodyCourse: boolean,
  singleLine: boolean
): CSSProperties {
  return {
    overflowY:
      (!course && zoom > 1) || (melodyCourse && zoom > DEFAULT_STAFF_PREFS.lessonZoom)
        ? "auto"
        : undefined,
    overflowX: !course && !singleLine ? "auto" : undefined
  };
}
