import type {
  SightReadingExercise,
  SightReadingGroup,
  SightGroupKind
} from "../musicLearning/sightReading";
import type { MusicControllerState } from "./musicCourseControllerView";
import type { MusicControllerActionsHost } from "./musicCourseControllerActions";

export interface MusicControlGroupQuestion {
  readonly index: number;
  readonly expected: SightGroupKind;
  readonly musicXml: string;
}
function groupXml(exercise: SightReadingExercise, group: SightReadingGroup): string {
  const visible = new Set(
    exercise.song.notes
      .filter((note) => note.startBeat >= group.startBeat && note.startBeat < group.endBeat)
      .flatMap((note) => (note.sourceIndex === undefined ? [] : [note.sourceIndex]))
  );
  const document = new DOMParser().parseFromString(exercise.musicXml, "application/xml");
  Array.from(document.querySelectorAll("note")).forEach((note, index) => {
    if (!visible.has(index)) {
      note.setAttribute("print-object", "no");
      note.setAttribute("print-spacing", "yes");
    }
  });
  return new XMLSerializer().serializeToString(document);
}
/** The control question is disclosed only after performance and before freezing its evidence. */
export function deferMusicControlGroup(
  state: MusicControllerState,
  stop: () => void,
  publish: () => void
): boolean {
  if (state.controlGroup !== null) return true;
  const activity = state.activity,
    sight = activity?.sight;
  if (
    !sight ||
    activity.purpose !== "control" ||
    state.groupAnswers.length > 0 ||
    sight.level === "notes"
  )
    return false;
  const group =
    sight.groups.find((candidate) => candidate.kind === "scalar" || candidate.kind === "triadic") ??
    (sight.level === "two-hands" ? undefined : sight.groups[0]);
  if (!group) return false;
  state.controlGroup = {
    index: group.index,
    expected: group.kind,
    musicXml: groupXml(sight, group)
  };
  state.status = "ready";
  stop();
  publish();
  return true;
}
export function answerMusicControlGroup(
  host: MusicControllerActionsHost,
  value: string,
  source: "keyboard" | "pointer"
): boolean {
  const question = host.state.controlGroup;
  if (!question) return false;
  if (!["scalar", "triadic", "repeated", "mixed"].includes(value)) return true;
  const atMs = performance.now();
  host.state.run?.pause(false, Math.max(0, atMs - host.offset()));
  if (!host.state.run?.recordChoice(value, source, atMs)) {
    host.publish();
    return true;
  }
  host.state.groupAnswers.push({ expected: question.expected, answer: value as SightGroupKind });
  host.state.controlGroup = null;
  host.complete();
  host.publish();
  return true;
}
