import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import type { FrameState } from "./frameState";
import { EnergyAttacks, energySources } from "./noteEnergy";
import type { EnergySource } from "./noteEnergy";

const note: SongNote = {
  id: "one",
  pitch: 60,
  start: 2,
  duration: 1,
  startBeat: 4,
  hand: "right"
};

function frame(overrides: Partial<FrameState> = {}): FrameState {
  return {
    time: 2,
    lookAhead: 2,
    statusOf: () => "pending",
    pressed: new Set(),
    sounding: new Set(),
    due: [],
    hands: new Set(["right"]),
    owns: () => true,
    ...overrides
  };
}

const colorOf = (source: SongNote) => (source.hand === "right" ? 0xff3300 : 0x33aaff);

function first(sources: readonly EnergySource[]): EnergySource {
  const source = sources[0];
  if (!source) throw new Error("Expected an energy source");
  return source;
}

describe("energySources", () => {
  it("grows faint approach energy, preserving note and finger colors", () => {
    const far = first(energySources([note], frame({ time: 0 }), colorOf));
    const near = first(energySources([note], frame({ time: 1.5 }), colorOf));
    expect(far.progress).toBe(0);
    expect(near.progress).toBe(0.75);
    expect(near.strength).toBeGreaterThan(far.strength);
    expect(near.strength).toBeLessThan(0.3);
    expect(near.color).toBe(0xff3300);
    expect(near.duration).toBe(note.duration);
    expect(near.sounding).toBe(false);
  });

  it("does not accept pending, missed or skipped notes just because their key is held", () => {
    for (const status of ["pending", "missed", "skipped", undefined] as const) {
      const source = first(
        energySources([note], frame({ pressed: new Set([60]), statusOf: () => status }), colorOf)
      );
      expect(source.sounding).toBe(false);
      expect(source.strength).toBeLessThan(1);
    }
  });

  it("sustains an accepted note while held and stops it on release or wrong input", () => {
    const accepted = frame({ statusOf: () => "hit", pressed: new Set([60]), time: 2.8 });
    expect(energySources([note], accepted, colorOf)[0]?.sounding).toBe(true);
    expect(energySources([note], accepted, colorOf)[0]?.strength).toBe(1);
    expect(energySources([note], { ...accepted, pressed: new Set() }, colorOf)[0]?.sounding).toBe(
      false
    );
    expect(
      energySources([note], { ...accepted, pressed: new Set([61]) }, colorOf)[0]?.sounding
    ).toBe(false);
  });

  it("reads accompaniment sounding pitches only for notes active now", () => {
    const future = { ...note, id: "next", start: 3.5 };
    const sources = energySources(
      [note, future],
      frame({ owns: () => false, sounding: new Set([60]) }),
      colorOf
    );
    expect(sources.map((source) => source.sounding)).toEqual([true, false]);
    expect(
      energySources([note], frame({ owns: () => false, pressed: new Set([60]) }), colorOf)[0]
        ?.sounding
    ).toBe(false);
  });

  it("keeps independent voices and clips sources to the visible time range", () => {
    const left = { ...note, id: "other-voice", hand: "left" as const };
    const sources = energySources([note, left], frame(), colorOf);
    expect(sources.map((source) => source.id)).toEqual(["one", "other-voice"]);
    expect(sources.map((source) => source.color)).toEqual([0xff3300, 0x33aaff]);
    expect(energySources([note], frame({ time: -0.1 }), colorOf)).toEqual([]);
    expect(energySources([note], frame({ time: 3.01 }), colorOf)).toEqual([]);
    expect(energySources([note], frame({ lookAhead: 0 }), colorOf)[0]?.progress).toBe(1);
  });
});

describe("EnergyAttacks", () => {
  it("emits once per note identity even for repeated pitches, re-presses and two voices", () => {
    const attacks = new EnergyAttacks();
    const sources = energySources(
      [note, { ...note, id: "second-voice" }],
      frame({ statusOf: () => "hit", pressed: new Set([60]) }),
      colorOf
    );
    expect(attacks.update(sources).map((source) => source.id)).toEqual(["one", "second-voice"]);
    expect(attacks.update(sources)).toEqual([]);
    attacks.update([]);
    expect(attacks.update(sources)).toEqual([]);
    expect(attacks.update([{ ...first(sources), id: "repeated-note" }])).toHaveLength(1);
    attacks.clear();
    expect(attacks.update(sources)).toHaveLength(2);
  });

  it("waits for actual accepted sounding rather than approach light", () => {
    const attacks = new EnergyAttacks();
    expect(attacks.update(energySources([note], frame(), colorOf))).toEqual([]);
    expect(
      attacks.update(
        energySources([note], frame({ statusOf: () => "hit", pressed: new Set([60]) }), colorOf)
      )
    ).toHaveLength(1);
  });
});
