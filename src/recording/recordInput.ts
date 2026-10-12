import type { KeyEvent } from "../input/midiInput";
import type { TakeRecorder } from "./take";

/** Store already resolved musical and real times; this adapter owns no clock. */
export function recordKeyInput(
  recorder: TakeRecorder,
  event: KeyEvent,
  songTime: number,
  realTime: number,
  raw: number,
  corrected: number,
  offset: number
): void {
  const timing = {
    rawTimestampMs: raw,
    correctedTimestampMs: corrected,
    inputOffsetMs: offset,
    source: event.source ?? "pointer"
  };
  if (event.type === "down")
    recorder.noteOn(event.pitch, event.velocity, songTime, realTime, event.deviceId, timing);
  else recorder.noteOff(event.pitch, songTime, realTime, event.deviceId, timing);
}
