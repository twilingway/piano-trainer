// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendTake, loadTakes, readTakes, saveTake, takeStorageKey, validTake } from "./history";
import type { Take } from "./take";

const fixture = (id = "take"): Take => ({
  id,
  songKey: "song",
  createdAt: "2026-10-07T10:00:00.000Z",
  mode: "tempo",
  speed: 0.75,
  hands: ["right"],
  from: 0,
  pedal: [],
  notes: [{ pitch: 60, velocity: 80, start: -0.02, end: 1, realStart: 0, realEnd: 1 }]
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});
describe("compatible take history", () => {
  it("preserves valid earlier records and accepts negative corrected attack time", () => {
    localStorage.setItem(takeStorageKey("song"), JSON.stringify([fixture()]));
    expect(loadTakes("song")).toEqual([fixture()]);
    expect(readTakes("song").error).toBeNull();
  });

  it("rejects malformed fields and nested timing without discarding valid neighbors", () => {
    const valid = fixture("good");
    const broken: unknown[] = [
      { ...fixture("bad-speed"), speed: 0 },
      { ...fixture("bad-mode"), mode: ["tempo"] },
      { ...fixture("bad-date"), createdAt: "broken" },
      { ...fixture("bad-hands"), hands: ["third"] },
      { ...fixture("bad-notes"), notes: [{ ...valid.notes[0], pitch: 200 }] },
      { ...fixture("bad-release"), pedal: [{ start: 1, end: 0, realStart: 0, realEnd: 1 }] },
      {
        ...fixture("bad-input"),
        notes: [
          {
            ...valid.notes[0],
            inputTiming: {
              rawTimestampMs: null,
              correctedTimestampMs: 1,
              inputOffsetMs: 0,
              source: "midi"
            }
          }
        ]
      },
      {
        ...fixture("bad-timing"),
        timing: {
          inputOffsets: { a: "1" },
          manualInputOffsetMs: 0,
          audioOffsetMs: 0,
          visualOffsetMs: 0,
          rulesVersion: 1,
          difficulty: "normal"
        }
      },
      { ...fixture("other-song"), songKey: "other" },
      valid
    ];
    localStorage.setItem(takeStorageKey("song"), JSON.stringify(broken));
    expect(readTakes("song")).toEqual({ takes: [valid], error: "invalid" });
    expect(validTake({ ...valid, speed: Infinity })).toBe(false);
    expect(validTake({ ...valid, from: NaN })).toBe(false);
  });

  it("keeps twenty newest entries in stored order and deduplicates ids", () => {
    const takes = Array.from({ length: 25 }, (_, i) => fixture(String(i)));
    localStorage.setItem(takeStorageKey("song"), JSON.stringify([takes[0], ...takes]));
    expect(loadTakes("song").map((take) => take.id)).toEqual(
      takes.slice(0, 20).map((take) => take.id)
    );
    const updated = { ...fixture("5"), speed: 0.5 };
    const result = saveTake(updated);
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual(updated);
    expect(result.filter((take) => take.id === "5")).toHaveLength(1);
    expect(appendTake(fixture("new"), result)[0]?.id).toBe("new");
  });

  it("reports damaged JSON and unavailable storage", () => {
    localStorage.setItem(takeStorageKey("song"), "broken json");
    expect(readTakes("song")).toEqual({ takes: [], error: "invalid" });
    expect(
      readTakes("song", {
        getItem: () => {
          throw new DOMException("Denied", "SecurityError");
        }
      })
    ).toEqual({ takes: [], error: "unavailable" });
  });
});
