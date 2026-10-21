import { describe, expect, it } from "vitest";
import { NativeKeyContacts } from "./NativeKeyContacts";
import type { NativeContactNotes } from "./NativeKeyContacts";
import type { SourceFinger } from "../../song/sourceFingering";
const observed = (
  onset: number,
  end: number | null,
  finger: SourceFinger["finger"] = 3
): SourceFinger => ({
  sourceId: "synthetic",
  pitch: 60,
  hand: "right",
  onset,
  estimatedContactEnd: end,
  finger,
  candidateFinger: finger,
  origin: finger === null ? "unknown" : "teacher",
  selectedFrom: finger === null ? "unknown" : "decision"
});
describe("native source key contacts", () => {
  it("releases physical holds before MIDI tails and preserves retrigger gaps across arbitrary seeks", () => {
    const contacts = new NativeKeyContacts();
    contacts.setNotes({
      left: [],
      right: [
        { pitch: 60, start: 1.0005, duration: 9, sourceFinger: observed(1, 1.2) },
        { pitch: 60, start: 2, duration: 8, sourceFinger: observed(2, 2.15) }
      ]
    });
    for (const [time, down] of [
      [1, true],
      [1.2, false],
      [2, true],
      [2.15, false],
      [1.1, true],
      [0.99, false],
      [9, false]
    ] as const)
      expect(contacts.down(60, time)).toBe(down);
  });
  it("isolates unknown MIDI holds from known acoustic tails even on the same pitch", () => {
    const contacts = new NativeKeyContacts();
    contacts.setNotes({
      left: [],
      right: [
        { pitch: 60, start: 1, duration: 10, sourceFinger: observed(1, 1.2) },
        { pitch: 60, start: 5, duration: 1, sourceFinger: observed(5, 5.1, null) },
        { pitch: 61, start: 3, duration: 0.5 },
        { pitch: 62, start: 3, duration: 0.5, sourceFinger: observed(3, null) }
      ]
    });
    expect(contacts.down(60, 2)).toBe(false);
    expect(contacts.down(60, 5.5)).toBe(true);
    expect(contacts.down(60, 6)).toBe(false);
    expect(contacts.down(61, 3.4)).toBe(true);
    expect(contacts.down(62, 3.4)).toBe(true);
  });
  it("lifts the key between back-to-back and overlapping repeats of one pitch", () => {
    const contacts = new NativeKeyContacts();
    contacts.setNotes({
      left: [],
      right: [
        { pitch: 64, start: 1, duration: 0.5 },
        { pitch: 64, start: 1.5, duration: 0.5 },
        { pitch: 64, start: 2, duration: 0.13 },
        { pitch: 64, start: 2.1, duration: 0.2 }
      ]
    });
    for (const [time, down] of [
      [1.36, true],
      [1.38, false],
      [1.5, true],
      [1.86, true],
      [1.88, false],
      [2, true],
      [2.04, true],
      [2.06, false],
      [2.1, true],
      [2.29, true],
      [2.31, false]
    ] as const)
      expect(contacts.down(64, time), `t=${time}`).toBe(down);
  });
  it("merges nested overlapping holds but not gaps and reuses immutable arrays without rebuilding", () => {
    const contacts = new NativeKeyContacts();
    const notes: NativeContactNotes = {
      left: [{ pitch: 60, start: 1, duration: 4 }],
      right: [
        { pitch: 60, start: 3, duration: 0.1 },
        { pitch: 60, start: 2, duration: 0.1 },
        { pitch: 60, start: 6, duration: 0.2 }
      ]
    };
    expect(contacts.setNotes(notes)).toBe(true);
    expect(contacts.setNotes({ ...notes })).toBe(false);
    expect(contacts.down(60, 4.9)).toBe(true);
    expect(contacts.down(60, 5.5)).toBe(false);
    expect(contacts.down(60, 6.1)).toBe(true);
    expect(contacts.down(60, NaN)).toBe(false);
    expect(contacts.setNotes({ left: [], right: [] })).toBe(true);
    expect(contacts.down(60, 4)).toBe(false);
  });
});
