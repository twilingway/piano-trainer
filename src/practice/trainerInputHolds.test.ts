import { describe, expect, it } from "vitest";
import { TrainerInputHolds } from "./trainerInputHolds";
import type { KeyEvent } from "../input/midiInput";

const down: KeyEvent = {
  type: "down",
  source: "midi",
  deviceId: "piano",
  channel: 1,
  pitch: 48,
  velocity: 90,
  timestamp: 100
};
describe("ownership before pair entry", () => {
  it("recovers matching expired releases without deleting a newer held attack", () => {
    const held = new TrainerInputHolds();
    held.record({ ...down, timestamp: 1000 }, 1000);
    held.record({ ...down, type: "up", timestamp: 1100 }, 1351);
    expect(held.snapshot()).toEqual([]);
    held.record({ ...down, timestamp: 1400 }, 1400);
    held.record({ ...down, type: "up", timestamp: 1100 }, 1401);
    expect(held.snapshot()).toEqual([{ ...down, timestamp: 1400 }]);
  });
  it("uses delivery order for identical raw timestamps", () => {
    const held = new TrainerInputHolds();
    held.record({ ...down, type: "up", timestamp: 1100 }, 1200);
    held.record({ ...down, timestamp: 1100 }, 1202);
    expect(held.snapshot()).toEqual([{ ...down, timestamp: 1100 }]);
    held.record({ ...down, type: "up", timestamp: 1099 }, 1203);
    expect(held.snapshot()).toHaveLength(1);
    held.record({ ...down, type: "up", timestamp: 1100 }, 1204);
    expect(held.snapshot()).toEqual([]);
  });
  it("retains a prefix release and never hands a late older down to the next policy", () => {
    const held = new TrainerInputHolds();
    held.record({ ...down, type: "up", timestamp: 1100 }, 1200);
    held.record({ ...down, timestamp: 1000 }, 1201);
    expect(held.snapshot()).toEqual([]);
    held.record({ ...down, timestamp: 1202 }, 1202);
    held.record({ ...down, type: "up", timestamp: 1101 }, 1203);
    expect(held.snapshot()).toEqual([{ ...down, timestamp: 1202 }]);
    held.record({ ...down, type: "up", timestamp: 1210 }, 1210);
    expect(held.snapshot()).toEqual([]);
  });
  it("keeps exact device/channel ownership and ignores old release of a fresh attack", () => {
    const held = new TrainerInputHolds();
    held.record(down, 100);
    held.record({ ...down, timestamp: 150 }, 150);
    held.record({ ...down, type: "up", timestamp: 90 }, 150);
    held.record({ ...down, type: "up", deviceId: "other", timestamp: 160 }, 160);
    expect(held.snapshot()).toEqual([down]);
    held.record({ ...down, type: "up", timestamp: 170 }, 170);
    expect(held.snapshot()).toEqual([]);
  });
  it("excludes future/expired ownership and clears unknown input on global loss", () => {
    const held = new TrainerInputHolds();
    held.record(down, 351);
    held.record({ ...down, timestamp: 501 }, 500);
    expect(held.snapshot()).toEqual([]);
    held.record({ ...down, timestamp: 500 }, 500);
    held.clear();
    expect(held.snapshot()).toEqual([]);
  });
});
