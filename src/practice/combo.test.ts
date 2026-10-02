import { describe, expect, it } from "vitest";

import { ComboCounter, PERFECT_WINDOW_S } from "./combo";

const hit = (offset: number) => ({ type: "hit", noteId: "n", offset }) as const;

describe("ComboCounter", () => {
  it("grades a hit by how far it is off the note", () => {
    const counter = new ComboCounter();
    expect(counter.record(hit(0))).toBe("perfect");
    expect(counter.record(hit(PERFECT_WINDOW_S))).toBe("perfect");
    expect(counter.record(hit(-PERFECT_WINDOW_S))).toBe("perfect");
    expect(counter.record(hit(-0.06))).toBe("great");
    expect(counter.record(hit(-0.1))).toBe("good");
    expect(counter.record(hit(0.15))).toBe("ok");
  });

  it("counts the run and breaks it on a miss or a stray key", () => {
    const counter = new ComboCounter();
    for (let index = 0; index < 3; index++) counter.record(hit(0));
    expect(counter.board().combo).toBe(3);
    expect(counter.record({ type: "wrong", pitch: 61 })).toBe("miss");
    expect(counter.board()).toEqual({ combo: 0, best: 3, accuracy: 1 });
    counter.record(hit(0.1));
    expect(counter.record({ type: "miss", noteId: "m" })).toBe("miss");
    expect(counter.board()).toEqual({ combo: 0, best: 3, accuracy: 0.7 });
  });

  it("uses the session difficulty judgement rather than regrading its offset", () => {
    const counter = new ComboCounter();
    expect(counter.record({ ...hit(0.04), judgement: "PERFECT" })).toBe("perfect");
    expect(counter.record({ ...hit(0.02), judgement: "GREAT" })).toBe("great");
    expect(counter.board().accuracy).toBe(0.9);
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
