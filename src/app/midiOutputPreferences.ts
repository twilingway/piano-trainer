import type { OutputChoice } from "../input/midiOutput";
const STORAGE_KEY = "midi-output-v1";
export function loadMidiOutput(): OutputChoice | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) return null;
    const { id, name } = stored as Record<string, unknown>;
    return typeof id === "string" && typeof name === "string" ? { id, name } : null;
  } catch {
    return null;
  }
}
export function saveMidiOutput(choice: OutputChoice | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    /* Storage is optional. */
  }
}
