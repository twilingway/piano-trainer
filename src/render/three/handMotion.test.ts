import { describe, expect, it } from "vitest";
import type { Finger } from "../../fingering/fingering";
import { HandSprings, knuckleSide, liveTarget, TIP_MM } from "./handMotion";
import type { LiveHand } from "./handMotion";
import { planHand } from "./handPlacement";
import type { FingeredNote, HandPlan } from "./handPlacement";

const C4 = 60,
  E4 = 64,
  F4 = 65,
  G4 = 67,
  A4 = 69;

function plan(notes: readonly FingeredNote[]): HandPlan {
  const planned = planHand(notes, "right");
  if (!planned) throw new Error("no plan");
  return planned;
}

/** Five fingers on C..G struck once, so the position is C..G, then `notes`. */
function inPosition(...notes: FingeredNote[]): HandPlan {
  const position = ([C4, 62, E4, F4, G4] as const).map((pitch, index) => ({
    start: 0,
    duration: 0.5,
    pitch,
    finger: (index + 1) as Finger
  }));
  return plan([...position, ...notes]);
}

describe("liveTarget", () => {
  it("draws the wrist towards the fifth finger more than towards the thumb", () => {
    const pinky = liveTarget(inPosition({ start: 2, duration: 2, pitch: G4, finger: 5 }), 3);
    const thumb = liveTarget(inPosition({ start: 2, duration: 2, pitch: C4, finger: 1 }), 3);
    expect(pinky.wrist.x).toBeGreaterThan(thumb.wrist.x + 3);
    expect(pinky.wrist.yaw).toBeGreaterThan(thumb.wrist.yaw);
    expect(pinky.wrist.roll).toBeGreaterThan(0);
  });

  it("drags a free finger after a pressing neighbour without pressing it", () => {
    const rest = liveTarget(inPosition(), 1.5).fingers[4].bend[0];
    const dragged = liveTarget(inPosition({ start: 2, duration: 2, pitch: E4, finger: 3 }), 3);
    expect(dragged.fingers[3].bend[0]).toBe(1);
    expect(dragged.fingers[4].bend[0]).toBeGreaterThan(rest + 0.2);
    expect(dragged.fingers[4].bend[0]).toBeLessThan(0.5);
  });

  it("drops the wrist in a stretch", () => {
    const stretched = liveTarget(
      inPosition(
        { start: 2, duration: 2, pitch: C4, finger: 1 },
        { start: 2, duration: 2, pitch: A4, finger: 5 }
      ),
      3
    );
    expect(stretched.anchor).toBe(0);
    expect(stretched.wrist.y).toBeLessThan(-2);
  });

  it("arcs up over a move between positions", () => {
    const moving = plan([
      { start: 0, duration: 0.4, pitch: C4, finger: 1 },
      { start: 1, duration: 0.4, pitch: A4 + 3, finger: 1 }
    ]);
    const [move] = moving.moves;
    if (!move) throw new Error("no move");
    const middle = liveTarget(moving, (move.depart + move.arrive) / 2);
    const before = liveTarget(moving, move.depart);
    expect(middle.wrist.y - before.wrist.y).toBeGreaterThan(8);
  });

  it("gives a little after a strike and settles", () => {
    const struck = inPosition({ start: 2, duration: 1, pitch: E4, finger: 3 });
    const at = liveTarget(struck, 2).wrist.y;
    expect(liveTarget(struck, 2.1).wrist.y - at).toBeGreaterThan(1);
    expect(Math.abs(liveTarget(struck, 2.3).wrist.y - at)).toBeLessThan(0.3);
  });

  it("sways a resting hand by a couple of millimetres, never freezing", () => {
    const resting = inPosition();
    const ys: number[] = [];
    const xs: number[] = [];
    for (let time = 2; time < 12; time += 0.05) {
      const { wrist } = liveTarget(resting, time);
      xs.push(wrist.x);
      ys.push(wrist.y);
    }
    const range = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(range(xs)).toBeGreaterThan(0.5);
    expect(range(xs)).toBeLessThan(4);
    expect(range(ys)).toBeGreaterThan(0.3);
    expect(range(ys)).toBeLessThan(2);
  });

  it("keeps a pressing finger on its key whatever the wrist does", () => {
    const pinky = liveTarget(inPosition({ start: 2, duration: 2, pitch: A4, finger: 5 }), 3);
    const tip = knuckleSide(pinky, 5) + pinky.wrist.x + pinky.wrist.yaw * TIP_MM[5];
    expect(tip).toBeCloseTo(23.5);
  });
});

describe("HandSprings", () => {
  function pressed(bend: number): LiveHand {
    const finger = { bend: [bend, bend, bend] as const, reach: 0, depth: 0 };
    return {
      anchor: 0,
      wrist: { x: 0, y: 0, z: 0, yaw: 0, roll: 0 },
      fingers: { 1: finger, 2: finger, 3: finger, 4: finger, 5: finger }
    };
  }

  it("starts on the target and follows it with the tip joint behind the knuckle", () => {
    const springs = new HandSprings();
    expect(springs.step(pressed(0), 1 / 60).fingers[3].bend[0]).toBe(0);
    const early = springs.step(pressed(1), 1 / 60).fingers[3].bend;
    expect(early[0]).toBeGreaterThan(0);
    expect(early[2]).toBeLessThan(early[0]);
    let late = early;
    for (let frame = 0; frame < 60; frame++)
      late = springs.step(pressed(1), 1 / 60).fingers[3].bend;
    expect(late[0]).toBeCloseTo(1, 2);
    expect(late[2]).toBeCloseTo(1, 2);
  });

  it("never bends a finger through its key", () => {
    const springs = new HandSprings();
    springs.step(pressed(0), 1 / 60);
    for (let frame = 0; frame < 30; frame++) {
      const { bend } = springs.step(pressed(1), 1 / 60).fingers[2];
      for (const joint of bend) expect(joint).toBeLessThanOrEqual(1);
    }
  });

  it("does not jump after a long frame", () => {
    const springs = new HandSprings();
    springs.step(pressed(0), 1 / 60);
    const after = springs.step(pressed(1), 5).fingers[1].bend[0];
    expect(after).toBeLessThanOrEqual(1);
    expect(after).toBeGreaterThan(0.5);
  });
});
