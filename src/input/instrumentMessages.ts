import type { PianoInstrument } from "./instrumentProfiles";

/** Channel numbers are player-facing 1–16; missing bank selectors emit no guessed CC. */
export function instrumentMessages(instrument: PianoInstrument, channel: number): number[][] {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16 || instrument.program === null)
    return [];
  const byte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 127;
  if (
    !byte(instrument.program) ||
    (instrument.bankMSB !== undefined && !byte(instrument.bankMSB)) ||
    (instrument.bankLSB !== undefined && !byte(instrument.bankLSB))
  )
    return [];
  const midiChannel = channel - 1;
  const messages: number[][] = [];
  if (instrument.bankMSB !== undefined) messages.push([0xb0 | midiChannel, 0, instrument.bankMSB]);
  if (instrument.bankLSB !== undefined) messages.push([0xb0 | midiChannel, 32, instrument.bankLSB]);
  messages.push([0xc0 | midiChannel, instrument.program]);
  return messages;
}
