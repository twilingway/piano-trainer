import { useState } from "react";
import doSheet from "./lesson-art/animation-prototypes/sheets/do-sheet.webp";
import reSheet from "./lesson-art/animation-prototypes/sheets/re-sheet.webp";
import miSheet from "./lesson-art/animation-prototypes/sheets/mi-sheet.webp";
import doPress from "./lesson-art/animation-prototypes/teacher/sheets/do-press-frame.webp";
import rePress from "./lesson-art/animation-prototypes/teacher/sheets/re-press-frame.webp";
import miPress from "./lesson-art/animation-prototypes/teacher/sheets/mi-press-frame.webp";
import idle from "./lesson-art/clay-lesson-teacher/idle-frame.webp";

type NoteCharacter = "do" | "re" | "mi";
type Expression = "neutral" | "correct" | "gentle-wrong";
export interface SongCourseCharactersProps {
  readonly companion: NoteCharacter | null;
  readonly expression: Expression;
  readonly reactionKey: string;
  readonly teacherPose: "idle" | NoteCharacter;
  readonly teacherVisible: boolean;
  readonly visible: boolean;
}
const NOTES = { do: doSheet, re: reSheet, mi: miSheet };
const TEACHER = { idle, do: doPress, re: rePress, mi: miPress };
const ROW = { neutral: "0%", correct: "50%", "gentle-wrong": "100%" };

/** Decorative companions only; written note shapes and grading belong to the score and attempt. */
export function SongCourseCharacters(props: SongCourseCharactersProps) {
  const [teacherFailed, setTeacherFailed] = useState(false);
  if (!props.visible) return null;
  return (
    <div className="song-course-characters" aria-hidden="true">
      {props.teacherVisible && !teacherFailed && (
        <img
          key={props.teacherPose}
          className="song-course-characters__teacher"
          src={TEACHER[props.teacherPose]}
          data-teacher-pose={props.teacherPose}
          width={512}
          height={544}
          decoding="async"
          alt=""
          onError={() => {
            setTeacherFailed(true);
          }}
        />
      )}
      {props.companion && (
        <NoteCompanion
          key={props.reactionKey}
          note={props.companion}
          expression={props.expression}
        />
      )}
    </div>
  );
}

function NoteCompanion({
  note,
  expression
}: {
  readonly note: NoteCharacter;
  readonly expression: Expression;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span
      className={`song-course-characters__note is-${expression}`}
      data-note-companion={note}
      data-expression={expression}
      style={{ backgroundImage: `url("${NOTES[note]}")`, backgroundPositionY: ROW[expression] }}
    >
      <img
        className="song-course-characters__note-source"
        hidden
        src={NOTES[note]}
        alt=""
        onError={() => {
          setFailed(true);
        }}
      />
    </span>
  );
}
