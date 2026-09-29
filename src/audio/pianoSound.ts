import * as Tone from "tone";

/*
 * The hand the program plays, voiced by the Salamander grand samples Tone.js
 * hosts. The player's own hand sounds from the piano itself.
 */
const SAMPLE_NOTES = ["A", "C", "D#", "F#"] as const;

function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: "A0.mp3", C8: "C8.mp3" };
  for (let octave = 1; octave <= 7; octave++) {
    for (const name of SAMPLE_NOTES) {
      urls[`${name}${String(octave)}`] = `${name.replace("#", "s")}${String(octave)}.mp3`;
    }
  }
  return urls;
}

let sampler: Tone.Sampler | undefined;

/** Must run from a user gesture: browsers keep audio suspended until then. */
export async function startPianoSound(): Promise<void> {
  await Tone.start();
  sampler ??= new Tone.Sampler({
    urls: sampleUrls(),
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/"
  }).toDestination();
  await Tone.loaded();
}

function noteName(pitch: number): string {
  return Tone.Frequency(pitch, "midi").toNote();
}

export function soundNoteOn(pitch: number): void {
  sampler?.triggerAttack(noteName(pitch));
}

export function soundNoteOff(pitch: number): void {
  sampler?.triggerRelease(noteName(pitch));
}

export function soundAllOff(): void {
  sampler?.releaseAll();
}

/*
 * Metronome: a short high blip, higher and louder on the first beat of a
 * measure ("tick") than on the others ("tock").
 */
let click: Tone.Synth | undefined;

export function soundClick(downbeat: boolean): void {
  click ??= new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }
  }).toDestination();
  click.volume.value = downbeat ? -8 : -14;
  click.triggerAttackRelease(downbeat ? "C7" : "G6", 0.03);
}
