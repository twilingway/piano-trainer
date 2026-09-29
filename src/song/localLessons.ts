import type { Exercise, ExerciseLevel } from "./exercises";

/*
 * Lessons from the git-ignored local-lessons folder: one folder a lesson, one
 * MusicXML file a level, ordered by file name. Scores that may not be
 * published live there; the build picks up whatever the folder holds.
 */
const FILES = import.meta.glob<string>("/local-lessons/*/*.{musicxml,xml}", {
  query: "?raw",
  import: "default",
  eager: true
});

/** "3 Соль мажор.musicxml" -> "Соль мажор": the leading number only orders the levels. */
function levelTitle(fileName: string): string {
  return fileName.replace(/\.(musicxml|xml)$/i, "").replace(/^\d+\s*[-.]?\s*/, "");
}

function buildLessons(files: Readonly<Record<string, string>>): Exercise[] {
  const byFolder = new Map<string, ExerciseLevel[]>();
  for (const [path, musicXml] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const [, folder = "", fileName = ""] = /^\/local-lessons\/([^/]+)\/([^/]+)$/.exec(path) ?? [];
    if (!folder) continue;
    const levels = byFolder.get(folder) ?? [];
    levels.push({ id: fileName, title: levelTitle(fileName), musicXml });
    byFolder.set(folder, levels);
  }
  return [...byFolder].map(([folder, levels]) => ({
    id: `local:${folder}`,
    title: folder,
    levels
  }));
}

export const LOCAL_LESSONS: readonly Exercise[] = buildLessons(FILES);
