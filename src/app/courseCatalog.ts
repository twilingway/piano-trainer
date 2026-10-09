import { buildCourseCatalog } from "../course/catalog";
import { songFromMusicXml } from "../song/musicxml";
import type { CourseAccessMode, CourseLesson, CoursePhrase } from "../course/model";
import { phraseVersion } from "../course/model";
import { LOCAL_LESSONS } from "../song/localLessons";

/** Build-time policy: review access cannot be enabled by saved player preferences. */
export const COURSE_ACCESS_MODE: CourseAccessMode = import.meta.env.DEV ? "review" : "progression";

const FILES = import.meta.glob<string>("/local-lessons/.course/**/*.{musicxml,xml}", {
  query: "?raw",
  import: "default",
  eager: true
});
const MANIFEST = import.meta.glob<string>("/local-lessons/course.json", {
  query: "?raw",
  import: "default",
  eager: true
});

/** Keep all old score variants available, without reclassifying their difficulty levels. */
export const PREVIOUS_COURSE_LESSONS = LOCAL_LESSONS.filter((lesson) =>
  /^local:0?[1-9]\s|^local:10\s/.test(lesson.id)
);
const titles = Object.fromEntries(
  PREVIOUS_COURSE_LESSONS.map((lesson) => [
    Number(/^local:(\d+)/.exec(lesson.id)?.[1]),
    lesson.title.replace(/^\d+\s*/, "").replace(/\s*\(урок \d+\)\s*$/i, "")
  ])
);
export const COURSE_LESSONS = buildCourseCatalog(
  MANIFEST["/local-lessons/course.json"] ?? null,
  FILES,
  titles
);

/** Canonical identity stays independent of display language and local filenames. */
export function coursePhraseSong(lesson: CourseLesson, phrase: CoursePhrase) {
  const title = `course:${lesson.id}:${phrase.id}:${phraseVersion(phrase)}`;
  return { ...songFromMusicXml(phrase.musicXml, title), title };
}
