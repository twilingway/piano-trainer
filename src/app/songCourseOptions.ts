import { courseLearnerMode } from "../songCourse/listenRepeat";
import type { PracticeOptions } from "../practice/session";
import type { CourseMaterial } from "../songCourse/model";
import type { Hand } from "../fingering/fingering";

export function songCourseOptions(material: CourseMaterial, speed: number): PracticeOptions {
  return {
    mode: courseLearnerMode(material.node.kind),
    speed,
    hands: new Set<Hand>(
      material.song.notes
        .filter((note) => material.source.learnerPartIds.includes(note.part ?? ""))
        .map((note) => note.hand)
    ),
    parts: new Set(material.source.learnerPartIds),
    accompaniment: material.node.kind !== "notes" && material.node.kind !== "duration",
    noteResult: false,
    countInBeats: 4
  };
}
