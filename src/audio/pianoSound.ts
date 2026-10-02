import * as Tone from "tone";
import { cancelScheduledVoices, loadScheduledSamples } from "./scheduledVoices";

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
/** Samples arrive over the network; a note struck before that is skipped, not an error. */
let samplesReady = false;

/** Must run from a user gesture: browsers keep audio suspended until then. */
export async function startPianoSound(): Promise<void> {
  await Tone.start();
  loadScheduledSamples(sampleUrls());
  sampler ??= new Tone.Sampler({
    urls: sampleUrls(),
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/"
  }).toDestination();
  await Tone.loaded();
  samplesReady = true;
}

/**
 * Starts the sound on the first click or key press anywhere on the page, so
 * keys played by mouse or computer keyboard sound before "Играть" is pressed.
 */
export function startSoundOnFirstGesture(): () => void {
  const start = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
    void startPianoSound();
  };
  window.addEventListener("pointerdown", start, true);
  window.addEventListener("keydown", start, true);
  return () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
  };
}

function noteName(pitch: number): string {
  return Tone.Frequency(pitch, "midi").toNote();
}

/** `velocity` is MIDI 1-127; without one the note sounds at full strength. */
export function soundNoteOn(pitch: number, velocity?: number, at?: number): void {
  if (!samplesReady) return;
  sampler?.triggerAttack(noteName(pitch), at, velocity === undefined ? 1 : velocity / 127);
}

export function soundNoteOff(pitch: number, at?: number): void {
  if (samplesReady) sampler?.triggerRelease(noteName(pitch), at);
}

export function soundAllOff(): void {
  cancelScheduledVoices();
  sampler?.releaseAll();
  click?.dispose();
  click = undefined;
}

/*
 * Metronome: a short high blip, higher and louder on the first beat of a
 * measure ("tick") than on the others ("tock").
 */
let click: Tone.Synth | undefined;

export function soundClick(downbeat: boolean, at?: number): void {
  click ??= new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }
  }).toDestination();
  click.volume.value = downbeat ? -8 : -14;
  click.triggerAttackRelease(downbeat ? "C7" : "G6", 0.03, at);
}

export function audioTime(): number {
  return Tone.getContext().immediate();
}

export function scheduleSound(at: number, action: (audioSeconds: number) => void): number {
  return Tone.getContext().setTimeout(
    () => {
      action(at);
    },
    Math.max(0, at - Tone.now())
  );
}

export function cancelScheduledSound(id: number): void {
  Tone.getContext().clearTimeout(id);
}
