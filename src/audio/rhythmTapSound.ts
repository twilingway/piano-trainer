import * as Tone from "tone";

let voice: Tone.PolySynth | undefined;

/** Immediate local-input feedback, independent of the score clock and judgement. */
export function soundRhythmTap(): void {
  if (Tone.getContext().state !== "running") return;
  voice ??= new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.02 }
  }).toDestination();
  voice.volume.value = -12;
  voice.triggerAttackRelease("C4", 0.06, Tone.getContext().immediate());
}

export function stopRhythmTapSound(): void {
  voice?.dispose();
  voice = undefined;
}
