import { describe, expect, it } from "vitest";
import { DEFAULT_MELODY_OUTPUT, parseMelodyOutput } from "./melodyOutput";

describe("parseMelodyOutput", () => {
  it.each([null, undefined, false, [], "midi", { mode: "unknown", channel: "1" }])(
    "uses browser defaults for invalid saved settings: %j",
    (saved) => {
      expect(parseMelodyOutput(saved)).toEqual(DEFAULT_MELODY_OUTPUT);
    }
  );

  it.each(["browser", "midi", "both"])("retains a valid %s route and channel", (mode) => {
    expect(parseMelodyOutput({ mode, channel: 16 })).toEqual({ mode, channel: 16 });
  });

  it.each([0, 17, 1.5, Infinity, NaN, null])("rejects an invalid MIDI channel: %j", (channel) => {
    expect(parseMelodyOutput({ mode: "midi", channel })).toEqual({ mode: "midi", channel: 1 });
  });
});
