import MidiPackage from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { orderPedalEvents } from "./midiPedalOrder";

const { Midi } = MidiPackage;

function file(events: readonly number[]): Uint8Array {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0];
  const data = new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0, ...events]);
  new DataView(data.buffer).setUint32(18, events.length);
  return data;
}

describe("SMF pedal event ordering", () => {
  it("moves CC64 before a simultaneous note-off, preserving CC order, tempo and running status", () => {
    const data = file([
      0, 0xff, 0x51, 3, 7, 0xa1, 0x20, 0, 0x90, 48, 90, 0x81, 0x70, 0x80, 48, 0, 0, 0xb0, 64, 64, 0,
      64, 63, 0, 0xff, 0x2f, 0
    ]);
    const original = data.slice();
    const expected = file([
      0, 0xff, 0x51, 3, 7, 0xa1, 0x20, 0, 0x90, 48, 90, 0x81, 0x70, 0xb0, 64, 64, 0, 0xb0, 64, 63,
      0, 0x80, 48, 0, 0, 0xff, 0x2f, 0
    ]);
    const ordered = orderPedalEvents(data);
    expect(ordered).toEqual(expected);
    expect(data).toEqual(original);
    const midi = new Midi(ordered);
    expect(midi.header.tempos[0]?.bpm).toBe(120);
    expect(midi.tracks[0]?.notes[0]?.duration).toBe(0.25);
    expect(
      midi.tracks[0]?.controlChanges[64]?.map((event) => Math.round(event.value * 127))
    ).toEqual([64, 63]);
    expect(orderPedalEvents(ordered)).toEqual(ordered);
  });

  it("preserves sysex, text meta, one-byte channel events and track lengths", () => {
    const rest = [
      0, 0xf0, 3, 0x7d, 1, 0xf7, 0, 0xff, 1, 3, 65, 66, 67, 0, 0xc0, 5, 0, 0xd0, 127, 0, 0xf7, 2, 1,
      2
    ];
    const cc = [0, 0xb0, 64, 127],
      end = [0, 0xff, 0x2f, 0];
    expect(orderPedalEvents(file([...rest, ...cc, ...end]))).toEqual(
      file([...cc, ...rest, ...end])
    );
  });

  it("rejects truncated chunks, channel events and invalid variable-length deltas", () => {
    for (const data of [
      new Uint8Array(),
      file([0, 0x90, 48]),
      file([0, 48, 90]),
      file([0x81, 0x80, 0x80, 0x80, 0]),
      file([0, 0xff, 1, 8, 65])
    ])
      expect(() => orderPedalEvents(data)).toThrow("Неверный MIDI");
    const truncated = file([0, 0xff, 0x2f, 0]);
    expect(() => orderPedalEvents(truncated.subarray(0, truncated.length - 1))).toThrow(
      "Неверный MIDI"
    );
  });
});
