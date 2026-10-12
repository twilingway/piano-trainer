import * as Tone from "tone";
import { type PianoLayer, pianoLayer } from "./pianoLayers";
import {
  loadPianoSamples,
  loadedPianoLayers,
  nearestSamplePitch,
  onPianoLayerLoaded,
  pianoSample,
  SAMPLE_PITCHES
} from "./pianoSamples";
import { cancelScheduledVoices } from "./scheduledVoices";
import { stopRhythmTapSound } from "./rhythmTapSound";

/*
 * The hand the program plays, voiced by the Salamander grand samples, one
 * sampler a velocity layer. The player's own hand sounds from the piano itself.
 */

/** Samples arrive over the network; a note struck before that is skipped, not an error. */
const samplers = new Map<PianoLayer, Tone.Sampler>();

function addSampler(layer: PianoLayer): void {
  if (samplers.has(layer)) return;
  const urls: Record<number, Tone.ToneAudioBuffer> = {};
  for (const pitch of SAMPLE_PITCHES) {
    const sample = pianoSample(layer, pitch);
    if (sample) urls[pitch] = sample;
  }
  samplers.set(layer, new Tone.Sampler({ urls, release: 1 }).toDestination());
}

let started = false;

/** Must run from a user gesture: browsers keep audio suspended until then. */
export async function startPianoSound(): Promise<void> {
  await Tone.start();
  if (Tone.getContext().state !== "running") throw new Error("Audio context is suspended");
  if (!started) {
    started = true;
    onPianoLayerLoaded(addSampler);
    for (const layer of loadedPianoLayers()) addSampler(layer);
  }
  await loadPianoSamples();
}

/**
 * Starts the sound on the first click or key press anywhere on the page, so
 * keys played by mouse or computer keyboard sound before "Играть" is pressed.
 */
export function startSoundOnFirstGesture(): () => void {
  let active = true;
  const start = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
    void startPianoSound().catch(() => {
      if (!active) return;
      window.addEventListener("pointerdown", start, true);
      window.addEventListener("keydown", start, true);
    });
  };
  window.addEventListener("pointerdown", start, true);
  window.addEventListener("keydown", start, true);
  return () => {
    active = false;
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
  };
}

function noteName(pitch: number): string {
  return Tone.Frequency(pitch, "midi").toNote();
}

/** `velocity` is MIDI 1-127; without one the note sounds at full strength. */
export function soundNoteOn(pitch: number, velocity?: number, at?: number): void {
  const pick = pianoLayer(velocity ?? 127, new Set(samplers.keys()));
  if (pick) samplers.get(pick.layer)?.triggerAttack(noteName(pitch), at, pick.gain);
}

export function soundNoteOff(pitch: number, at?: number): void {
  for (const sampler of samplers.values()) sampler.triggerRelease(noteName(pitch), at);
}

export function soundAllOff(): void {
  stopRhythmTapSound();
  cancelScheduledVoices();
  for (const sampler of samplers.values()) sampler.releaseAll();
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

/** Rhythm needs only the click voice, not downloaded piano samples. */
export async function ensureMetronomeSound(): Promise<boolean> {
  try {
    await Tone.start();
  } catch {
    return false;
  }
  return metronomeSoundReady();
}

export function metronomeSoundReady(): boolean {
  const destination = Tone.getDestination();
  return (
    Tone.getContext().state === "running" &&
    !destination.mute &&
    destination.volume.value !== -Infinity
  );
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

/** Observation callbacks run after actual audio time, rather than ahead of it for scheduling. */
export function scheduleSoundObserved(at: number, action: () => void): number {
  return Tone.getContext().setTimeout(action, Math.max(0, at - audioTime()));
}

export function pianoSoundReady(pitches: readonly number[]): boolean {
  const destination = Tone.getDestination();
  if (
    Tone.getContext().state !== "running" ||
    destination.mute ||
    destination.volume.value === -Infinity
  )
    return false;
  const pick = pianoLayer(100, loadedPianoLayers());
  return Boolean(
    pick && pitches.every((pitch) => pianoSample(pick.layer, nearestSamplePitch(pitch))?.loaded)
  );
}

/** A short context interruption invalidates a reference even if audio resumes before its jobs. */
export function onPianoSoundInterrupted(action: () => void): () => void {
  const context = Tone.getContext();
  const changed = () => {
    if (context.state !== "running") action();
  };
  context.on("statechange", changed);
  return () => {
    context.off("statechange", changed);
  };
}
