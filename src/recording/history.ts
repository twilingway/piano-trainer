import type { Take } from "./take";

/** Takes kept per song and level; the oldest go first. */
const MAX_TAKES = 20;

function storageKey(songKey: string): string {
  return `takes:${songKey}`;
}

/** Earlier takes of a song, newest first; none if storage is unavailable or unreadable. */
export function loadTakes(songKey: string): Take[] {
  try {
    const raw = localStorage.getItem(storageKey(songKey));
    return raw ? (JSON.parse(raw) as Take[]) : [];
  } catch {
    return [];
  }
}

/** Adds a take at the front of its song's history and returns the history as stored. */
export function saveTake(take: Take): Take[] {
  const takes = [take, ...loadTakes(take.songKey).filter((item) => item.id !== take.id)].slice(
    0,
    MAX_TAKES
  );
  try {
    localStorage.setItem(storageKey(take.songKey), JSON.stringify(takes));
  } catch {
    // A full quota or private mode: the take still shows now, it just is not kept.
  }
  return takes;
}
