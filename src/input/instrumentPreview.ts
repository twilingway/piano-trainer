import type { KeyEvent } from "./midiInput";
import { createMelodyMidiOutput, type MelodyMidiOutput } from "./melodyMidiOutput";
import { instrumentMessages } from "./instrumentMessages";
import type { PianoInstrument } from "./instrumentProfiles";

// A short original phrase, independent of the loaded lesson and its clock.
const PHRASE = [60, 62, 64, 67, 64, 62, 60];
const STEP_MS = 320;
const RELEASE_MS = 270;
const END_MS = (PHRASE.length - 1) * STEP_MS + 600;

export interface InstrumentPreview {
  readonly play: (instrument: PianoInstrument, channel: number) => void;
  readonly stop: () => void;
  readonly isEcho: (event: KeyEvent) => boolean;
}

/** Owns its scheduled notes only; stopping never sends a channel-wide panic. */
export function createInstrumentPreview(
  send: (message: number[]) => void,
  onPlaying: (playing: boolean) => void,
  now: () => number = () => performance.now()
): InstrumentPreview {
  let completion: ReturnType<typeof setTimeout> | undefined;
  let active: MelodyMidiOutput | undefined;
  let recent: { output: MelodyMidiOutput; until: number }[] = [];
  const stop = () => {
    if (completion !== undefined) clearTimeout(completion);
    completion = undefined;
    if (!active) return;
    active.reset();
    recent.push({ output: active, until: now() + 100 });
    active = undefined;
    onPlaying(false);
  };
  return {
    play(instrument, channel) {
      stop();
      const messages = instrumentMessages(instrument, channel);
      if (!messages.length) return;
      for (const message of messages) send(message);
      recent = recent.filter((item) => item.until >= now());
      active = createMelodyMidiOutput(send, channel, now);
      const output = active;
      const origin = now();
      onPlaying(true);
      PHRASE.forEach((pitch, index) => {
        const id = `preview-${String(index)}`;
        output.noteOn(pitch, 60, origin + index * STEP_MS, id);
        output.noteOff(
          pitch,
          origin + index * STEP_MS + (index === PHRASE.length - 1 ? 550 : RELEASE_MS),
          id
        );
      });
      completion = setTimeout(stop, END_MS);
    },
    stop,
    isEcho(event) {
      return (
        (active?.isEcho(event) ?? false) ||
        recent.some((item) => item.until >= now() && item.output.isEcho(event))
      );
    }
  };
}
