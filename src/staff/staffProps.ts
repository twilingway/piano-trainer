import type { SharedTabLabels } from "./sharedReaderSpacing";
import type { StaffWorldSource } from "./staffWorldSnapshot";
import type { LessonStaffFeedbackSource } from "./lessonStaffFeedback";
import type { StaffPresentation } from "./staffPresentation";

export interface StaffProps {
  readonly illustration?: boolean;
  readonly material?: "classic" | "clay";
  readonly pitchColors?: boolean;
  readonly pitchColorNoteId?: string | undefined;
  readonly onLoadSettled?: (() => void) | undefined;
  readonly lessonStaffFeedback?: LessonStaffFeedbackSource | undefined;
  readonly worldScoreSource?: StaffWorldSource | undefined;
  readonly timeline?:
    | {
        readonly timeAtBeat: (beat: number) => number;
        readonly beats: readonly number[];
        /** Optional visual run-up on the same axis; it never inserts score events. */
        readonly fromBeat?: number;
      }
    | undefined;
  readonly presentation?: StaffPresentation | undefined;
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
  /** 1 = the viewport-fitted baseline size. */
  readonly zoom: number;
  readonly noteColor: string;
  readonly playedNoteColor?: string;
  readonly scoreColor: string;
  /** One endless line that scrolls sideways, or systems wrapped to the width like a printed page. */
  readonly singleLine: boolean;
  /** Keep the cursor in view as the song plays. */
  readonly follow: boolean;
  /** Finger numbers over and under the notes. */
  readonly fingers: boolean;
  readonly fingerColors: "mono" | "fingers";
  /** Break lines where the score says so (the fixed measures-per-line layout) instead of by width. */
  readonly breaksFromScore: boolean;
  /** A click on the score: the beat of the note nearest to it. */
  readonly onSeek?: (beat: number) => void;
  /** Notehead colours by markKey(beat, pitch): the review of the last take. */
  readonly marks?: ReadonlyMap<string, string> | undefined;
  /** Where the song is right now in quarters; a single line scrolls with it every frame. */
  readonly liveBeat?: (() => number) | undefined;
  /** Share of the window this staff may take; two staves stacked take less each. */
  readonly maxShare?: number;
  /** Publish this original score's layout for a second reader in the same workspace. */
  readonly shareGeometry?: boolean;
  /** Labels in a second reader may require wider shared engraving. */
  readonly sharedTabs?: SharedTabLabels | undefined;
  /** A reading course: no highlight, a fitted zoom and a cursor that leaves the note readable. */
  readonly course?: boolean;
  /** A course's prompts with its extreme notes: every prompt keeps their room, nothing jumps. */
  readonly courseRange?: readonly string[] | undefined;
}
