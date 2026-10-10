// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { createAppStore } from "./store";
import { readingActions } from "./readingSlice";
import { loadReadingState, READING_STORAGE_KEY } from "./readingPersistence";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";

function result(id: string, task: "notes" | "check" = "notes") {
  const exercise = generateReadingExercise(task, 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    session.prepare(note.id, note.pitch, index * 1000);
    session.present(note.id, index * 1000);
    session.answer(note.pitch, "keyboard", index * 1000 + 100);
  });
  const completed = session.result(id, 123);
  if (!completed) throw new Error("Incomplete fixture");
  return completed;
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}
describe("reading preferences and progress", () => {
  it("saves only own preferences, limits history per task, and restores a fresh selection", () => {
    const backing = storage(),
      store = createAppStore({ storage: backing });
    const original = store.getState().preferences;
    expect(backing.setItem).not.toHaveBeenCalled();
    store.dispatch(readingActions.select({ task: "notes", seed: 42 }));
    store.dispatch(
      readingActions.preferencesChanged({
        automaticHints: false,
        nameDelayMs: 8000,
        keyDelayMs: 9000
      })
    );
    const sample = result("sample");
    for (let i = 0; i < 23; i++)
      store.dispatch(readingActions.resultAdded({ ...sample, id: String(i) }));
    store.dispatch(readingActions.resultAdded(result("check", "check")));
    expect(store.getState().reading.history.filter((item) => item.task === "notes")).toHaveLength(
      20
    );
    expect(store.getState().reading.history.filter((item) => item.task === "check")).toHaveLength(
      1
    );
    const restored = createAppStore({ storage: backing });
    expect(restored.getState().reading).toMatchObject({
      task: "notes",
      seed: 42,
      preferences: { automaticHints: false, nameDelayMs: 8000 }
    });
    expect(store.getState().preferences).toEqual(original);
    expect(restored.getState().reading).not.toHaveProperty("answers");
    expect(backing.setItem.mock.calls.every(([key]) => key === READING_STORAGE_KEY)).toBe(true);
  });
  it("retains in-memory progress and surfaces storage failures", () => {
    const backing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      }
    };
    const store = createAppStore({ storage: backing });
    store.dispatch(readingActions.resultAdded(result("saved")));
    expect(store.getState().reading.history).toHaveLength(1);
    expect(store.getState().persistence.errors[`localStorage:${READING_STORAGE_KEY}:write`]).toBe(
      "unavailable"
    );
    expect(
      loadReadingState({ getItem: () => "broken", setItem: () => undefined }).errors
    ).toHaveProperty(`localStorage:${READING_STORAGE_KEY}:read`, "invalid");
  });
  it("forces a safe effective display without touching any saved value", () => {
    const saved = {
      ...DEFAULT_STAFF_PREFS,
      lane: true,
      hands: true,
      labels: true,
      noteNames: "en" as const,
      fingers: true,
      fingerColors: "fingers" as const,
      chords: true
    };
    expect(readingDisplayProfile(saved)).toMatchObject({
      lane: false,
      keys: true,
      visible: true,
      labels: false,
      noteNames: "off",
      fingers: false,
      fingerColors: "mono",
      hands: false,
      chords: false
    });
    expect(saved.fingers).toBe(true);
    expect(saved.noteNames).toBe("en");
  });
});
