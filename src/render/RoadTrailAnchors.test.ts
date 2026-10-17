import { describe, expect, it, vi } from "vitest";
import type { SongNote } from "../song/song";
import type { NotesFrame } from "./NotesLayer";
import { PIANO_LOOK } from "./noteLook";
import { RoadTrailAnchors } from "./RoadTrailAnchors";

const note = (id: string, start: number, duration: number, pitch = 60): SongNote => ({
  id,
  start,
  duration,
  pitch,
  startBeat: start,
  hand: "right",
  finger: 1
});
const keys = new Map([[60, { pitch: 60, x: 100, width: 40, black: false }]]);
const frame = (time: number, overrides: Partial<NotesFrame> = {}): NotesFrame => ({
  time,
  lookAhead: 6,
  hands: new Set(),
  owns: () => false,
  statusOf: () => undefined,
  ...overrides
});
const road = () => ({ drawsNativeRoad: true, addTrailAnchor: vi.fn() });

describe("score-derived hit-line trail anchors", () => {
  it("retains the consumed predecessor until the next note arrives and responds immediately to seeks", () => {
    const first = note("first", 0, 0.1);
    const links = new RoadTrailAnchors([first, note("next", 0.5, 0.1)]);
    const target = road();
    for (const time of [0.1, 0.25, 0.49]) {
      target.addTrailAnchor.mockClear();
      links.draw(frame(time), keys, PIANO_LOOK, target);
      expect(target.addTrailAnchor).toHaveBeenCalledExactlyOnceWith(
        120,
        43.2,
        PIANO_LOOK.color(first),
        1
      );
    }
    for (const time of [0.5, 2, 0.09, -1]) {
      target.addTrailAnchor.mockClear();
      links.draw(frame(time), keys, PIANO_LOOK, target);
      expect(target.addTrailAnchor).not.toHaveBeenCalled();
    }
    links.draw(frame(0.25), keys, PIANO_LOOK, target);
    expect(target.addTrailAnchor).toHaveBeenCalledOnce();
  });

  it("rejects originally long pauses even when their remaining screen gap becomes short", () => {
    const links = new RoadTrailAnchors([note("first", 0, 0.1), note("late", 2, 0.1)]);
    const target = road();
    links.draw(frame(1.8), keys, PIANO_LOOK, target);
    expect(target.addTrailAnchor).not.toHaveBeenCalled();
    new RoadTrailAnchors([note("new-song", 2, 0.1)]).draw(frame(1.8), keys, PIANO_LOOK, target);
    expect(target.addTrailAnchor).not.toHaveBeenCalled();
  });

  it("keeps the original 22 percent cutoff for each lookahead profile", () => {
    const target = road();
    for (const lookAhead of [2.22, 6]) {
      for (const factor of [0.99, 1.01]) {
        const next = { ...note("next", 1 + lookAhead * 0.22 * factor, 0.1), finger: 5 as const };
        const links = new RoadTrailAnchors([note("first", 0, 1), next]);
        target.addTrailAnchor.mockClear();
        links.draw(frame(next.start - 0.05, { lookAhead }), keys, PIANO_LOOK, target);
        expect(target.addTrailAnchor).toHaveBeenCalledTimes(factor < 1 ? 1 : 0);
      }
    }
  });

  it("uses the furthest sustained voice and preserves the previous note's custom or missed colour", () => {
    const held = note("held", 0, 1.5);
    const links = new RoadTrailAnchors([note("next", 1.8, 0.2), note("inside", 0.2, 0.1), held]);
    const target = road();
    links.draw(
      frame(1.6, { colorOf: (n) => (n.id === "held" ? 0x123456 : 0xffffff) }),
      keys,
      PIANO_LOOK,
      target
    );
    expect(target.addTrailAnchor).toHaveBeenLastCalledWith(120, 43.2, 0x123456, 1);
    links.draw(frame(1.6, { statusOf: () => "missed" }), keys, PIANO_LOOK, target);
    expect(target.addTrailAnchor).toHaveBeenLastCalledWith(120, 43.2, 0xff2454, 1);
  });

  it("never joins other pitches or the legacy renderer", () => {
    const target = road();
    new RoadTrailAnchors([note("first", 0, 0.1, 61), note("next", 0.5, 0.1)]).draw(
      frame(0.25),
      keys,
      PIANO_LOOK,
      target
    );
    expect(target.addTrailAnchor).not.toHaveBeenCalled();
    target.drawsNativeRoad = false;
    new RoadTrailAnchors([note("first", 0, 0.1), note("next", 0.5, 0.1)]).draw(
      frame(0.25),
      keys,
      PIANO_LOOK,
      target
    );
    expect(target.addTrailAnchor).not.toHaveBeenCalled();
  });
});
