import { describe, expect, it } from "vitest";
import { GRACE_BP300, type PianoInstrument } from "./instrumentProfiles";
import { instrumentMessages } from "./instrumentMessages";

const panFlute: PianoInstrument = { id: "flute", name: "Pan Flute", program: 75 };

describe("instrument MIDI messages", () => {
  it("selects extended Grace voices and resets the bank when returning to the base piano", () => {
    const messages = [128, 237, 0].flatMap((index) => {
      const instrument = GRACE_BP300.instruments[index];
      if (!instrument) throw new Error(`Missing Grace instrument ${String(index)}`);
      return instrumentMessages(instrument, 1);
    });
    expect(messages).toEqual([
      [0xb0, 0, 8],
      [0xc0, 0],
      [0xb0, 0, 100],
      [0xc0, 48],
      [0xb0, 0, 0],
      [0xc0, 0]
    ]);
  });
  it("sends the program on the selected 1-based melody channel without a guessed bank", () => {
    expect(instrumentMessages(panFlute, 1)).toEqual([[0xc0, 75]]);
    expect(instrumentMessages(panFlute, 16)).toEqual([[0xcf, 75]]);
  });

  it("sends explicit bank selectors in MSB, LSB, program order, including bank zero", () => {
    expect(instrumentMessages({ ...panFlute, program: 0, bankMSB: 0, bankLSB: 4 }, 3)).toEqual([
      [0xb2, 0, 0],
      [0xb2, 32, 4],
      [0xc2, 0]
    ]);
    expect(instrumentMessages({ ...panFlute, bankLSB: 0 }, 2)).toEqual([
      [0xb1, 32, 0],
      [0xc1, 75]
    ]);
  });

  it("never emits messages for an unknown extended voice", () => {
    expect(instrumentMessages({ ...panFlute, program: null, panelNumber: 176 }, 1)).toEqual([]);
  });

  it.each([0, 17, 1.5, NaN, Infinity])("rejects invalid channel %s", (channel) => {
    expect(instrumentMessages(panFlute, channel)).toEqual([]);
  });

  it.each([
    { program: 128 },
    { program: -1 },
    { program: NaN },
    { bankMSB: 128 },
    { bankLSB: 0.5 }
  ])("fails closed for invalid internal values %j", (change) => {
    expect(instrumentMessages({ ...panFlute, ...change }, 1)).toEqual([]);
  });
});
