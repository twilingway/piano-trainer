import type { InputTiming, PedalSpan, PlayedNote, Take } from "./take";

/** Takes kept per song and level; the oldest go first. */
export const MAX_TAKES = 20;

export function takeStorageKey(songKey: string): string {
  return `takes:${songKey}`;
}

/** Earlier takes of a song, newest first; none if storage is unavailable or unreadable. */
type ReadStorage = Pick<Storage, "getItem">;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown, low: number, high: number): value is number =>
  finite(value) && Number.isInteger(value) && value >= low && value <= high;
function validSpan(value: unknown): value is PedalSpan {
  return (
    record(value) &&
    finite(value.start) &&
    finite(value.end) &&
    value.end >= value.start &&
    finite(value.realStart) &&
    finite(value.realEnd) &&
    value.realEnd >= value.realStart
  );
}
function validInputTiming(value: unknown): value is InputTiming {
  return (
    record(value) &&
    finite(value.rawTimestampMs) &&
    finite(value.correctedTimestampMs) &&
    finite(value.inputOffsetMs) &&
    typeof value.source === "string"
  );
}
function validPlayedNote(value: unknown): value is PlayedNote {
  return (
    validSpan(value) &&
    record(value) &&
    integer(value.pitch, 0, 127) &&
    integer(value.velocity, 1, 127) &&
    (value.deviceId === undefined || typeof value.deviceId === "string") &&
    (value.inputTiming === undefined || validInputTiming(value.inputTiming))
  );
}
function validTiming(value: unknown): value is NonNullable<Take["timing"]> {
  return (
    record(value) &&
    record(value.inputOffsets) &&
    Object.values(value.inputOffsets).every(finite) &&
    finite(value.manualInputOffsetMs) &&
    finite(value.audioOffsetMs) &&
    finite(value.visualOffsetMs) &&
    integer(value.rulesVersion, 1, Number.MAX_SAFE_INTEGER) &&
    typeof value.difficulty === "string" &&
    ["easy", "normal", "hard", "expert"].includes(value.difficulty) &&
    (value.learningWindow === undefined || typeof value.learningWindow === "boolean")
  );
}
export function validTake(value: unknown): value is Take {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.songKey === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    (value.mode === "tempo" || value.mode === "wait") &&
    finite(value.speed) &&
    value.speed > 0 &&
    Array.isArray(value.hands) &&
    value.hands.every((hand: unknown) => hand === "left" || hand === "right") &&
    finite(value.from) &&
    value.from >= 0 &&
    Array.isArray(value.notes) &&
    value.notes.every(validPlayedNote) &&
    Array.isArray(value.pedal) &&
    value.pedal.every(validSpan) &&
    (value.parts === undefined ||
      (Array.isArray(value.parts) &&
        value.parts.every((part: unknown) => typeof part === "string"))) &&
    (value.playable === undefined ||
      (record(value.playable) &&
        integer(value.playable.low, 0, 127) &&
        integer(value.playable.high, 0, 127) &&
        value.playable.low <= value.playable.high)) &&
    (value.timing === undefined || validTiming(value.timing))
  );
}
export function readTakes(
  songKey: string,
  storage?: ReadStorage
): { takes: Take[]; error: string | null } {
  try {
    const raw = (storage ?? localStorage).getItem(takeStorageKey(songKey));
    if (raw === null) return { takes: [], error: null };
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return { takes: [], error: "invalid" };
    }
    if (!Array.isArray(value)) return { takes: [], error: "invalid" };
    const takes: Take[] = [],
      seen = new Set<string>();
    let error: string | null = null;
    for (const item of value) {
      if (!validTake(item) || item.songKey !== songKey) {
        error = "invalid";
        continue;
      }
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (takes.length < MAX_TAKES) takes.push(item);
    }
    return { takes, error };
  } catch {
    return { takes: [], error: "unavailable" };
  }
}
export function loadTakes(songKey: string): Take[] {
  return readTakes(songKey).takes;
}
export function appendTake(take: Take, history: readonly Take[]): Take[] {
  return [take, ...history.filter((item) => item.id !== take.id)].slice(0, MAX_TAKES);
}

/** Adds a take at the front of its song's history and returns the history as stored. */
export function saveTake(take: Take): Take[] {
  const takes = appendTake(take, loadTakes(take.songKey));
  try {
    localStorage.setItem(takeStorageKey(take.songKey), JSON.stringify(takes));
  } catch {
    // A full quota or private mode: the take still shows now, it just is not kept.
  }
  return takes;
}
