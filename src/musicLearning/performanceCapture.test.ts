import { describe, expect, it } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import { MusicPerformanceCapture } from "./performanceCapture";
import type { MusicPerformanceInput, MusicPerformanceReceipt } from "./performanceCapture";

const input: MusicPerformanceInput = { source: "midi", deviceId: "piano", channel: 1 };
function harness(ready = true, filter = input) {
  const capture = new MusicPerformanceCapture({ presentationId: "one", input: filter });
  if (ready) capture.setReady(true, 100);
  const send = (
    type: "down" | "up",
    pitch: number,
    raw: number,
    songBeat: number | undefined,
    receipt: Partial<MusicPerformanceReceipt> = {},
    changes: Partial<KeyEvent> = {}
  ) =>
    capture.receive(
      { type, pitch, velocity: 80, timestamp: raw, ...input, ...changes },
      {
        presentationId: "one",
        raw,
        corrected: raw,
        received: raw,
        songBeat,
        hand: "right",
        admitted: true,
        playing: true,
        ...receipt
      }
    );
  return { capture, send };
}
describe("MusicPerformanceCapture", () => {
  it("keeps a wrong first pitch and exact unquantized session beat coordinates", () => {
    const h = harness();
    expect(h.send("down", 61, 200, 1.03125)).toEqual({ down: true, up: false });
    expect(h.capture.finish()).toBeNull();
    expect(h.send("up", 61, 300, 1.1484375)).toEqual({ down: false, up: true });
    expect(h.capture.snapshot()).toEqual({
      heldCount: 0,
      status: "active",
      notes: [{ pitch: 61, startBeat: 1.03125, durationBeats: 0.1171875, hand: "right" }]
    });
    expect(h.capture.finish()).toEqual([
      { pitch: 61, startBeat: 1.03125, durationBeats: 0.1171875, hand: "right" }
    ]);
    expect(h.capture.snapshot().status).toBe("finished");
    expect(Object.keys(h.capture.snapshot().notes[0] ?? {})).toEqual([
      "pitch",
      "startBeat",
      "durationBeats",
      "hand"
    ]);
  });
  it("stores the score part supplied at attack, without claiming the physical playing hand", () => {
    const h = harness();
    h.send("down", 48, 200, 0, { hand: "left" });
    h.send("down", 60, 210, 0, { hand: "right" });
    h.send("up", 60, 300, 0.75, { hand: "left" });
    h.send("up", 48, 310, 1.125, { hand: "right" });
    expect(h.capture.finish()).toEqual([
      { pitch: 48, startBeat: 0, durationBeats: 1.125, hand: "left" },
      { pitch: 60, startBeat: 0, durationBeats: 0.75, hand: "right" }
    ]);
  });
  it("does not accumulate repeated down or use a preheld key as a fresh attack", () => {
    const h = harness(false);
    expect(h.send("down", 60, 50, undefined, { playing: false }).down).toBe(false);
    h.capture.setReady(true, 100);
    expect(h.send("down", 60, 200, 0).down).toBe(false);
    expect(h.send("up", 60, 210, 0).up).toBe(false);
    expect(h.send("down", 60, 220, 0.125).down).toBe(true);
    expect(h.send("down", 60, 230, 0.25).down).toBe(false);
    expect(h.send("up", 60, 300, 0.875).up).toBe(true);
    expect(h.capture.finish()).toEqual([
      { pitch: 60, startBeat: 0.125, durationBeats: 0.75, hand: "right" }
    ]);
  });
  it("seeds only known physical owners and demands their release before completion", () => {
    const h = harness(false);
    h.capture.seedHeld(
      [
        { type: "down", pitch: 60, velocity: 80, timestamp: 50, ...input },
        { type: "down", pitch: 62, velocity: 80, timestamp: 60, ...input, deviceId: "foreign" }
      ],
      100
    );
    h.capture.setReady(true, 150);
    expect(h.capture.snapshot().heldCount).toBe(1);
    expect(h.capture.finish()).toBeNull();
    expect(h.send("down", 60, 200, 0).down).toBe(false);
    expect(h.send("up", 60, 210, 0.5).up).toBe(false);
    expect(h.capture.finish()).toEqual([]);
  });
  it("tracks preparation, paused and unadmitted keys without accepting notes", () => {
    const h = harness(false);
    expect(h.send("down", 60, 200, 0).down).toBe(false);
    h.send("up", 60, 210, 0.1);
    h.capture.setReady(true, 220);
    h.capture.setPaused(true, 230);
    expect(h.send("down", 62, 240, 0.2).down).toBe(false);
    h.send("up", 62, 250, 0.2);
    h.capture.setPaused(false, 260);
    expect(h.send("down", 64, 270, 0.3, { admitted: false }).down).toBe(false);
    h.send("up", 64, 280, 0.4);
    expect(h.send("down", 65, 290, 0.5, { playing: false }).down).toBe(false);
    h.send("up", 65, 300, 0.5);
    expect(h.capture.finish()).toEqual([]);
  });
  it("uses the session's frozen beat for a pause release and excludes pause time across resume", () => {
    const paused = harness();
    paused.send("down", 60, 200, 1);
    paused.capture.setPaused(true, 300);
    expect(paused.send("up", 60, 1000, 1.25, { playing: false, admitted: false })).toEqual({
      down: false,
      up: true
    });
    expect(paused.capture.finish()).toEqual([
      { pitch: 60, startBeat: 1, durationBeats: 0.25, hand: "right" }
    ]);
    const resumed = harness();
    resumed.send("down", 60, 200, 1);
    resumed.capture.setPaused(true, 300);
    resumed.capture.setPaused(false, 1000);
    resumed.send("up", 60, 1200, 1.5);
    expect(resumed.capture.finish()?.[0]?.durationBeats).toBe(0.5);
  });
  it("rejects delayed attacks before readiness or the most recent pause boundary", () => {
    const h = harness(false);
    h.capture.setReady(true, 400);
    expect(h.send("down", 60, 399, 1, { received: 500 }).down).toBe(false);
    h.send("up", 60, 510, 1.25);
    h.capture.setPaused(true, 520);
    h.capture.setPaused(false, 600);
    expect(h.send("down", 62, 550, 1.5, { received: 650 }).down).toBe(false);
    h.send("up", 62, 660, 1.75);
    expect(h.capture.finish()).toEqual([]);
  });
  it.each([
    { source: "keyboard" as const },
    { source: "pointer" as const },
    { deviceId: "other" },
    { channel: 2 }
  ])("ignores a foreign source/device/channel down or release: %j", (changes) => {
    const h = harness();
    h.send("down", 60, 200, 0);
    const before = h.capture.snapshot();
    expect(h.send("up", 60, 210, 1, {}, changes)).toEqual({ down: false, up: false });
    expect(h.send("down", 65, 220, 1, {}, changes)).toEqual({ down: false, up: false });
    expect(h.capture.snapshot()).toEqual(before);
    h.send("up", 60, 300, 1);
    expect(h.capture.finish()).toHaveLength(1);
  });
  it("keeps ownership distinct across admitted MIDI channels when no channel is selected", () => {
    const h = harness(true, { source: "midi", deviceId: "piano" });
    h.send("down", 60, 200, 0, {}, { channel: 1 });
    h.send("down", 60, 210, 0.25, {}, { channel: 2 });
    h.send("up", 60, 300, 1, {}, { channel: 3 });
    expect(h.capture.snapshot().heldCount).toBe(2);
    h.send("up", 60, 310, 1, {}, { channel: 1 });
    h.send("up", 60, 320, 1.25, {}, { channel: 2 });
    expect(h.capture.finish()).toHaveLength(2);
  });
  it("accepts the existing inclusive 250ms delivery boundary but rejects older attacks", () => {
    const h = harness();
    expect(h.send("down", 60, 200, 0, { received: 450 }).down).toBe(true);
    expect(h.send("up", 60, 300, 0.5, { received: 550 }).up).toBe(true);
    expect(h.send("down", 62, 400, 1, { received: 651 }).down).toBe(false);
    expect(h.capture.finish()).toEqual([
      { pitch: 60, startBeat: 0, durationBeats: 0.5, hand: "right" }
    ]);
  });
  it("cleans stale own release physically but cancels evidence instead of inventing duration", () => {
    const h = harness();
    h.send("down", 60, 200, 0);
    expect(h.send("up", 60, 300, 1, { received: 551 })).toEqual({ down: false, up: false });
    expect(h.capture.snapshot()).toEqual({ heldCount: 0, notes: [], status: "cancelled" });
    expect(h.capture.finish()).toBeNull();
  });
  it("ignores raw-future, invalid timing, stale presentation and malformed provenance without note mutation", () => {
    const h = harness();
    const before = h.capture.snapshot();
    for (const raw of [NaN, Infinity, -1, Number.MAX_VALUE])
      h.send("down", 60, raw, 1, { received: 200 });
    h.send("down", 60, 201, 1, { received: 200 });
    h.send("down", 60, 200, 1, { corrected: NaN });
    h.send("down", 60, 200, 1, { received: NaN });
    h.send("down", 60, 200, 1, { presentationId: "old" });
    for (const changes of [
      { pitch: 128 },
      { pitch: 60.5 },
      { velocity: NaN },
      { channel: 17 },
      { deviceId: "" },
      { timestamp: 199 }
    ])
      h.send("down", 60, 200, 1, {}, changes);
    expect(h.capture.snapshot()).toEqual(before);
  });
  it.each([undefined, NaN, Infinity])(
    "cancels an otherwise admitted attack without a usable song beat: %s",
    (songBeat) => {
      const h = harness();
      expect(h.send("down", 60, 200, songBeat).down).toBe(false);
      expect(h.capture.snapshot().notes).toEqual([]);
      expect(h.capture.finish()).toBeNull();
      expect(h.capture.snapshot().status).toBe("cancelled");
    }
  );
  it.each([undefined, NaN, Infinity, 0.5])(
    "does not fabricate an own release duration for invalid/backwards song beat: %s",
    (songBeat) => {
      const h = harness();
      h.send("down", 60, 200, 1);
      expect(h.send("up", 60, 300, songBeat).up).toBe(false);
      expect(h.capture.snapshot()).toEqual({ heldCount: 0, status: "cancelled", notes: [] });
      expect(h.capture.finish()).toBeNull();
    }
  );
  it("does not resurrect a physically released key from an out-of-order delivered down", () => {
    const h = harness();
    h.send("up", 60, 220, 1, { received: 230 });
    expect(h.send("down", 60, 200, 0, { received: 250 }).down).toBe(false);
    expect(h.capture.snapshot().heldCount).toBe(0);
    expect(h.capture.finish()).toEqual([]);
  });
  it("does not let an older release remove a newer physical attack", () => {
    const h = harness();
    h.send("down", 60, 300, 1);
    expect(h.send("up", 60, 250, 0.5, { received: 350 }).up).toBe(false);
    expect(h.capture.snapshot().heldCount).toBe(1);
    h.send("up", 60, 400, 2);
    expect(h.capture.finish()?.[0]?.durationBeats).toBe(1);
  });
  it("accepts a new attack after a real release even when raw timestamp resolution is coarse", () => {
    const h = harness();
    h.send("down", 60, 200, 0);
    h.send("up", 60, 210, 0.25);
    expect(h.send("down", 60, 210, 0.25, { received: 211 }).down).toBe(true);
    h.send("up", 60, 220, 0.5);
    expect(h.capture.finish()).toHaveLength(2);
  });
  it("keeps negative count-in beats and zero-length releases without grid rounding", () => {
    const h = harness();
    h.send("down", 60, 200, -0.125);
    h.send("up", 60, 210, -0.125);
    expect(h.capture.finish()).toEqual([
      { pitch: 60, startBeat: -0.125, durationBeats: 0, hand: "right" }
    ]);
  });
  it("never completes by note count and cancels overflow beyond the shared 128-note limit", () => {
    const h = harness();
    for (let index = 0; index < 128; index++) {
      h.send("down", 60, 200 + index * 2, index / 3);
      h.send("up", 60, 201 + index * 2, index / 3 + 1 / 7);
    }
    expect(h.capture.snapshot()).toMatchObject({ status: "active", heldCount: 0 });
    expect(h.capture.snapshot().notes).toHaveLength(128);
    expect(h.send("down", 60, 1000, 50).down).toBe(false);
    expect(h.capture.snapshot().status).toBe("cancelled");
    h.send("up", 60, 1010, 51);
    expect(h.capture.finish()).toBeNull();
  });
  it("finishes empty explicitly, returns detached notes, and ignores events after finish", () => {
    const empty = harness();
    expect(empty.capture.finish()).toEqual([]);
    expect(empty.send("down", 60, 200, 0).down).toBe(false);
    const h = harness();
    h.send("down", 60, 200, 0);
    h.send("up", 60, 300, 1);
    const first = h.capture.finish();
    expect(h.capture.finish()).toEqual(first);
    expect(h.capture.finish()).not.toBe(first);
    expect(h.capture.snapshot().notes).not.toBe(first);
    h.capture.cancel();
    expect(h.capture.snapshot().status).toBe("finished");
  });
  it("cancels without accepting later notes or leaking an unfinished attack through handoff", () => {
    const h = harness();
    h.send("down", 60, 200, 0);
    h.capture.seedHeld([{ type: "down", pitch: 64, velocity: 90, timestamp: 210, ...input }], 220);
    expect(h.capture.snapshot().status).toBe("cancelled");
    expect(h.send("down", 67, 300, 1).down).toBe(false);
    expect(h.capture.finish()).toBeNull();
  });
  it("supports keyboard input without requiring MIDI metadata or a physical-hand assertion", () => {
    const h = harness(true, { source: "keyboard" });
    const keyboard = (type: "down" | "up", atMs: number, songBeat: number) =>
      h.capture.receive(
        {
          type,
          pitch: 60,
          velocity: 80,
          source: "keyboard",
          deviceId: "keyboard",
          timestamp: atMs
        },
        {
          presentationId: "one",
          raw: atMs,
          corrected: atMs,
          received: atMs,
          songBeat,
          hand: "right",
          admitted: true,
          playing: true
        }
      );
    expect(keyboard("down", 200, 0).down).toBe(true);
    expect(keyboard("up", 300, 1).up).toBe(true);
    expect(h.capture.finish()?.[0]?.hand).toBe("right");
  });
});

describe("performance completed count", () => {
  it("counts only accepted physical releases, deduplicates them and retains only completed evidence on cancel", () => {
    const h = harness();
    expect(h.capture.completedCount).toBe(0);
    h.send("down", 60, 200, 0);
    expect(h.capture.completedCount).toBe(0);
    h.send("up", 60, 210, 0);
    expect(h.capture.completedCount).toBe(1);
    h.send("up", 60, 211, 0);
    expect(h.capture.completedCount).toBe(1);
    h.send("down", 64, 220, 1);
    expect(h.capture.completedCount).toBe(1);
    h.capture.cancel();
    h.send("up", 64, 230, 2);
    expect(h.capture.completedCount).toBe(1);
    expect(h.capture.snapshot().notes).toHaveLength(h.capture.completedCount);
  });
});
