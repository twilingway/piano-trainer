import doSheet from "./lesson-art/animation-prototypes/sheets/do-sheet.webp";
import reSheet from "./lesson-art/animation-prototypes/sheets/re-sheet.webp";
import miSheet from "./lesson-art/animation-prototypes/sheets/mi-sheet.webp";
import doPress from "./lesson-art/animation-prototypes/teacher/sheets/do-press-frame.webp";
import rePress from "./lesson-art/animation-prototypes/teacher/sheets/re-press-frame.webp";
import miPress from "./lesson-art/animation-prototypes/teacher/sheets/mi-press-frame.webp";
import idle from "./lesson-art/clay-lesson-teacher/idle-frame.webp";

import rewardStar from "./lesson-art/reward-star.webp";
import type { CourseMaterial } from "../songCourse/model";
import { courseTeacherPose } from "../songCourse/characterPresentation";

export const NOTE_CHARACTER_ART = { do: doSheet, re: reSheet, mi: miSheet };
export const TEACHER_ART = { idle, do: doPress, re: rePress, mi: miPress };
export type TeacherArtPose = keyof typeof TEACHER_ART;

/** Only the current scene's reachable verified poses, plus its idle and reward image. */
export function songCourseSceneArt(material: CourseMaterial): readonly string[] {
  const urls = new Set<string>([idle, rewardStar]);
  const guided = !["performance", "independent-phrase"].includes(material.node.kind);
  if (guided) {
    for (const note of material.expected) {
      const pose = courseTeacherPose(material, note.sourceNoteId);
      urls.add(TEACHER_ART[pose]);
      const companions: Readonly<Partial<Record<number, keyof typeof NOTE_CHARACTER_ART>>> = {
        60: "do",
        62: "re",
        64: "mi"
      };
      const companion = companions[note.pitch];
      if (companion) urls.add(NOTE_CHARACTER_ART[companion]);
    }
  }
  return [...urls];
}

// All accepted frames share this reviewed alpha128 envelope; no texture is rewritten.
export const TEACHER_VISIBLE_FRAME = {
  width: 512,
  height: 544,
  left: 29,
  right: 480,
  top: 16,
  bottom: 528
};
