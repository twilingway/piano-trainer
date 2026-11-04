import type { PracticeOptions } from "../practice/session";
import type { CourseMaterial } from "../songCourse/model";
import type { Hand } from "../fingering/fingering";

export function songCourseOptions(material: CourseMaterial, speed: number): PracticeOptions {
  return {
    mode: material.node.kind === "performance" ? "tempo" : "wait",
    speed,
    hands: new Set<Hand>(
      material.song.notes
        .filter((note) => material.source.learnerPartIds.includes(note.part ?? ""))
        .map((note) => note.hand)
    ),
    parts: new Set(material.source.learnerPartIds),
    accompaniment: true,
    noteResult: false,
    countInBeats: 4
  };
}
