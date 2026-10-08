import { songFromMusicXml } from "../song/musicxml";
import type { CourseLesson, CoursePhrase, CourseStage } from "./model";

const STAGES: readonly CourseStage[] = ["right", "left", "both"];
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Only exact, relative score paths from the local glob are allowed. */
function localScore(path: unknown, files: Readonly<Record<string, string>>): string | null {
  if (!text(path) || /[\\:]/.test(path) || !path.startsWith(".course/")) return null;
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return null;
  if (!/\.(musicxml|xml)$/i.test(path)) return null;
  return files[`/local-lessons/${path}`] ?? null;
}

function parseLesson(value: unknown, files: Readonly<Record<string, string>>): CourseLesson | null {
  const row = object(value);
  if (
    row?.reviewed !== true ||
    !text(row.id) ||
    !text(row.title) ||
    !text(row.goal) ||
    typeof row.number !== "number" ||
    !Number.isInteger(row.number) ||
    row.number < 1 ||
    row.number > 10 ||
    !Array.isArray(row.stages) ||
    row.stages.length === 0 ||
    !Array.isArray(row.phrases) ||
    row.phrases.length === 0
  )
    return null;
  const stages = row.stages.filter((stage): stage is CourseStage =>
    STAGES.includes(stage as CourseStage)
  );
  if (stages.length !== row.stages.length || new Set(stages).size !== stages.length) return null;
  if (
    stages.some(
      (stage, index) =>
        index > 0 && STAGES.indexOf(stage) <= STAGES.indexOf(stages[index - 1] ?? "right")
    )
  )
    return null;
  const phrases: CoursePhrase[] = [];
  for (const item of row.phrases) {
    const phrase = object(item);
    if (!phrase || !text(phrase.id) || !text(phrase.version)) return null;
    const musicXml = localScore(phrase.musicXml, files);
    if (!musicXml) return null;
    try {
      const song = songFromMusicXml(musicXml, row.title);
      if (song.notes.length === 0 || !Number.isFinite(song.duration) || song.duration <= 0)
        return null;
      if (
        song.notes.some(
          (note) =>
            !Number.isInteger(note.pitch) ||
            note.pitch < 0 ||
            note.pitch > 127 ||
            !Number.isFinite(note.start) ||
            !Number.isFinite(note.duration) ||
            note.duration <= 0
        )
      )
        return null;
      if (
        stages.some((stage) =>
          stage === "both"
            ? !["right", "left"].every((hand) => song.notes.some((note) => note.hand === hand))
            : !song.notes.some((note) => note.hand === stage)
        )
      )
        return null;
    } catch {
      return null;
    }
    phrases.push({ id: phrase.id, version: phrase.version, musicXml });
  }
  if (new Set(phrases.map((phrase) => phrase.id)).size !== phrases.length) return null;
  return { id: row.id, number: row.number, title: row.title, goal: row.goal, stages, phrases };
}

/** Bad or absent content never makes an unreviewed course playable. */
export function buildCourseCatalog(
  manifest: string | null,
  files: Readonly<Record<string, string>>,
  legacyTitles: Readonly<Record<number, string>> = {}
): readonly CourseLesson[] {
  const placeholders: CourseLesson[] = Array.from({ length: 10 }, (_, index) => ({
    id: `course-lesson-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    title: legacyTitles[index + 1] ?? "Урок {number}",
    goal: "Разучите фразы по одной руке, затем соедините их.",
    stages: STAGES,
    phrases: []
  }));
  let rows: unknown[];
  try {
    const root = object(manifest === null ? null : JSON.parse(manifest));
    rows = root && Array.isArray(root.lessons) ? root.lessons : [];
  } catch {
    rows = [];
  }
  const lessons = rows
    .map((row) => parseLesson(row, files))
    .filter((lesson): lesson is CourseLesson => lesson !== null);
  for (const lesson of lessons) {
    if (
      lessons.filter((other) => other.id === lesson.id || other.number === lesson.number).length > 1
    )
      continue;
    placeholders[lesson.number - 1] = lesson;
  }
  return placeholders;
}
