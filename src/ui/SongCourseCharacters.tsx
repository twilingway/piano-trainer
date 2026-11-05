import { useEffect, useState } from "react";
import { NOTE_CHARACTER_ART, TEACHER_ART, type TeacherArtPose } from "./songCourseCharacterArt";
import { decodeLessonImage, isLessonImageDecoded } from "./lessonImageDecode";
type NoteCharacter = "do" | "re" | "mi";
type Expression = "neutral" | "correct" | "gentle-wrong";
export interface SongCourseCharactersProps {
  readonly companion: NoteCharacter | null;
  readonly expression: Expression;
  readonly reactionKey: string;
  readonly teacherPose: "idle" | NoteCharacter;
  readonly teacherVisible: boolean;
  readonly visible: boolean;
  readonly presentationId?: string;
  readonly onArtError?: () => void;
}

const ROW = { neutral: "0%", correct: "50%", "gentle-wrong": "100%" };

/** Decorative companions only; written note shapes and grading belong to the score and attempt. */
export function SongCourseCharacters(props: SongCourseCharactersProps) {
  const teacherPose = useDecodedTeacherPose(
    props.teacherPose,
    props.visible && props.teacherVisible,
    props.presentationId ?? "default"
  );
  if (!props.visible) return null;
  return (
    <div className="song-course-characters" aria-hidden="true">
      {props.teacherVisible && (
        <img
          className="song-course-characters__teacher"
          src={teacherPose ? TEACHER_ART[teacherPose] : undefined}
          data-teacher-pose={teacherPose ?? "loading"}
          style={{ visibility: teacherPose ? "visible" : "hidden" }}
          onError={props.onArtError}
          width={512}
          height={544}
          decoding="async"
          alt=""
        />
      )}
      {props.companion && (
        <NoteCompanion
          key={props.reactionKey}
          note={props.companion}
          expression={props.expression}
          onArtError={props.onArtError}
        />
      )}
    </div>
  );
}

function NoteCompanion({
  note,
  expression,
  onArtError
}: {
  readonly note: NoteCharacter;
  readonly expression: Expression;
  readonly onArtError: (() => void) | undefined;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span
      className={`song-course-characters__note is-${expression}`}
      data-note-companion={note}
      data-expression={expression}
      style={{
        backgroundImage: `url("${NOTE_CHARACTER_ART[note]}")`,
        backgroundPositionY: ROW[expression]
      }}
    >
      <img
        className="song-course-characters__note-source"
        hidden
        src={NOTE_CHARACTER_ART[note]}
        alt=""
        onError={() => {
          setFailed(true);
          onArtError?.();
        }}
      />
    </span>
  );
}

/** Keep the last decoded frame while another loads; scene ownership cancels obsolete swaps. */
function useDecodedTeacherPose(
  requested: TeacherArtPose,
  visible: boolean,
  scene: string
): TeacherArtPose | null {
  const [decoded, setDecoded] = useState<{
    readonly pose: TeacherArtPose;
    readonly scene: string;
  } | null>(() =>
    isLessonImageDecoded(TEACHER_ART[requested]) ? { pose: requested, scene } : null
  );
  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    void decodeLessonImage(TEACHER_ART[requested], abort.signal).then((ready) => {
      if (ready && !abort.signal.aborted) setDecoded({ pose: requested, scene });
    });
    return () => {
      abort.abort();
    };
  }, [requested, visible, scene]);
  if (!visible) return null;
  if (isLessonImageDecoded(TEACHER_ART[requested])) return requested;
  return decoded?.scene === scene ? decoded.pose : null;
}
