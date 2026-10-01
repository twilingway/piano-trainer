import type { RefObject } from "react";

import type { StaffPrefs } from "../app/useStaffPrefs";
import type { SplitDirection, TakeStaff } from "../app/useTakeReview";
import { Staff } from "../staff/Staff";

interface Props {
  /** The score on the staff; a MIDI song has none. */
  readonly staffXml: string | undefined;
  readonly prefs: StaffPrefs;
  /** Lines break where the score says, not by the width. */
  readonly fixedLines: boolean;
  readonly beat: number;
  readonly liveBeat: () => number;
  readonly onSeek: (beat: number) => void;
  readonly reviewMarks: ReadonlyMap<string, string> | undefined;
  /** The take written out as a score, when it is shown. */
  readonly transcription:
    { readonly musicXml: string; readonly marks: ReadonlyMap<string, string> } | undefined;
  readonly takeStaff: TakeStaff;
  readonly splitDirection: SplitDirection;
  readonly comparing: boolean;
  readonly waiting: boolean;
  /** Where the trainer's Pixi view mounts. */
  readonly hostRef: RefObject<HTMLDivElement | null>;
  /** Where the original mounts while a take is compared with it. */
  readonly mirrorHostRef: RefObject<HTMLDivElement | null>;
}

/** The game: the staff (and the take's own) over the falling notes (and the original's). */
export function Workspace({ hostRef, mirrorHostRef, ...props }: Props) {
  const { prefs, transcription, takeStaff } = props;
  // The lane shows notes and keys, only the keys (a strip), or nothing at all.
  const laneMode = prefs.lane ? "full" : prefs.keys ? "keys" : "hidden";
  // With the lane hidden or cut to its keys, the staff may take more of the screen.
  const staffRoom = laneMode === "hidden" ? 1.9 : laneMode === "keys" ? 1.4 : 1;
  return (
    <div className="workspace">
      <div className="workspace-main">
        {props.staffXml && prefs.visible && (
          <div className={`staves staves--${transcription ? takeStaff : "single"}`}>
            <div className="staff-slot">
              {transcription && <span className="staff-label">Оригинал</span>}
              <Staff
                musicXml={props.staffXml}
                beat={props.beat}
                zoom={prefs.zoom}
                singleLine={prefs.singleLine}
                follow={prefs.follow}
                fingers={prefs.fingers}
                breaksFromScore={props.fixedLines}
                onSeek={props.onSeek}
                liveBeat={props.liveBeat}
                marks={props.reviewMarks}
                maxShare={(transcription && takeStaff === "column" ? 0.26 : 0.45) * staffRoom}
              />
            </div>
            {transcription && (
              <div className="staff-slot">
                <span className="staff-label">Твой дубль</span>
                <Staff
                  musicXml={transcription.musicXml}
                  beat={props.beat}
                  zoom={prefs.zoom}
                  singleLine={prefs.singleLine}
                  follow={prefs.follow}
                  fingers={prefs.fingers}
                  breaksFromScore={props.fixedLines}
                  onSeek={props.onSeek}
                  liveBeat={props.liveBeat}
                  marks={transcription.marks}
                  maxShare={(takeStaff === "column" ? 0.26 : 0.45) * staffRoom}
                />
              </div>
            )}
          </div>
        )}

        {/* Hidden, not removed: the view under it keeps the keys, the sound and the take going. */}
        <div className={`lanes lanes--${props.splitDirection} lanes--${laneMode}`}>
          <div className="lane" ref={hostRef}>
            {props.comparing && <span className="lane-label">Твой дубль</span>}
            {props.waiting && <span className="waiting-pill">Жду ноту</span>}
          </div>
          {props.comparing && (
            <div className="lane" ref={mirrorHostRef}>
              <span className="lane-label">Оригинал</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
