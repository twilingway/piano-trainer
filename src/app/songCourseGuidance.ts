import { quartersAt } from "../song/song";
import type { SongCourseView } from "./songCourseContracts";
import type { KeyEvent } from "../input/midiInput";
import type { PracticeSession } from "../practice/session";
import type { CourseMaterial } from "../songCourse/model";
export const courseInputSource = (event: KeyEvent) =>
  (event.deviceId ?? event.source ?? "pointer") + ":" + String(event.channel ?? 0);
export const courseInputKey = (event: KeyEvent) =>
  courseInputSource(event) + ":" + String(event.pitch);
export function songCourseGuidance(
  material: CourseMaterial | null,
  guided: boolean,
  session: PracticeSession,
  playing: boolean
) {
  const due =
    material?.song.notes.filter(
      (note) =>
        material.source.learnerPartIds.includes(note.part ?? "") &&
        note.id === session.owedNote()?.id
    ) ?? [];
  return {
    lights: guided && playing ? due.map((note) => note.pitch) : [],
    frame: {
      hintNotes: [],
      due,
      waitingFor: session.waiting ? due : [],
      hints: guided,
      neutralKeys: !guided
    }
  };
}

export function courseMelodyProgress(material: CourseMaterial, time: number): number {
  return Math.min(
    1,
    Math.max(
      0,
      quartersAt(material.song, time) /
        Math.max(quartersAt(material.song, material.song.duration), 0.001)
    )
  );
}
export function songCourseSceneId(view: SongCourseView): string {
  return view.material
    ? "song-course:" +
        view.material.source.id +
        "@" +
        view.material.source.revision +
        ":" +
        view.material.node.id +
        ":" +
        String(view.revision)
    : "";
}

/** Read the existing musical lead-in; this presentation never advances time. */
export function courseCountIn(material: CourseMaterial, time: number): number | undefined {
  if (!Number.isFinite(time) || time >= 0) return undefined;
  const first = material.song.beats[0];
  const second = material.song.beats[1];
  const seconds = first && second ? second.time - first.time : 0.5;
  return seconds > 0 ? Math.max(1, Math.ceil(-time / seconds)) : undefined;
}
