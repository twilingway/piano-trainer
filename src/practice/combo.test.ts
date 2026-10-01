import { describe, expect, it } from "vitest";

import { ComboCounter, PERFECT_WINDOW_S } from "./combo";

const hit = (offset: number) => ({ type: "hit", noteId: "n", offset }) as const;

describe("ComboCounter", () => {
  it("grades a hit by how far it is off the note", () => {
    const counter = new ComboCounter();
    expect(counter.record(hit(0))).toBe("perfect");
    expect(counter.record(hit(PERFECT_WINDOW_S))).toBe("perfect");
    expect(counter.record(hit(-PERFECT_WINDOW_S))).toBe("perfect");
    expect(counter.record(hit(-0.1))).toBe("early");
    expect(counter.record(hit(0.1))).toBe("late");
  });

  it("counts the run and breaks it on a miss or a stray key", () => {
    const counter = new ComboCounter();
    for (let index = 0; index < 3; index++) counter.record(hit(0));
    expect(counter.board().combo).toBe(3);
    expect(counter.record({ type: "wrong", pitch: 61 })).toBe("miss");
    expect(counter.board()).toEqual({ combo: 0, best: 3, accuracy: 3 / 4 });
    counter.record(hit(0.1));
    expect(counter.record({ type: "miss", noteId: "m" })).toBe("miss");
    expect(counter.board()).toEqual({ combo: 0, best: 3, accuracy: 4 / 6 });
  });

  it("ignores events that are not strikes", () => {
    const counter = new ComboCounter();
    expect(counter.record({ type: "beat", downbeat: true })).toBeUndefined();
    expect(counter.board()).toEqual({ combo: 0, best: 0, accuracy: 1 });
  });

  it("starts over on reset", () => {
    const counter = new ComboCounter();
    counter.record(hit(0));
    counter.record({ type: "wrong", pitch: 61 });
    counter.reset();
    expect(counter.board()).toEqual({ combo: 0, best: 0, accuracy: 1 });
  });
});
