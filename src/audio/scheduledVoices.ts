import * as Tone from "tone";
import { pianoLayer } from "./pianoLayers";
import { loadedPianoLayers, nearestSamplePitch, pianoSample } from "./pianoSamples";
const voices = new Map<string, Set<Tone.ToneBufferSource>>();
const clicks = new Set<Tone.Synth>();
const cleanup = new Set<number>();
const cancellationListeners = new Set<() => void>();
export function scheduledNoteOn(
  pitch: number,
  velocity: number | undefined,
  at: number,
  id = String(pitch),
  elapsedSeconds = 0
): boolean {
  const pick = pianoLayer(velocity ?? 100, loadedPianoLayers());
  const nearest = nearestSamplePitch(pitch);
  const sample = pick && pianoSample(pick.layer, nearest);
  if (!pick || !sample) return false;
  const source = new Tone.ToneBufferSource({
    url: sample,
    playbackRate: 2 ** ((pitch - nearest) / 12),
    fadeOut: 0.08
  }).toDestination();
  const active = voices.get(id) ?? new Set<Tone.ToneBufferSource>();
  voices.set(id, active);
  active.add(source);
  source.onended = () => {
    active.delete(source);
    if (active.size === 0 && voices.get(id) === active) voices.delete(id);
    source.dispose();
  };
  source.start(at, elapsedSeconds * 2 ** ((pitch - nearest) / 12), undefined, pick.gain);
  return true;
}
export function scheduledNoteOff(pitch: number, at: number, id = String(pitch)): void {
  for (const source of voices.get(id) ?? []) source.stop(at);
}
/** Remove only this note's nodes, including future attacks, without touching other owners. */
export function disposeScheduledVoice(id: string): void {
  const active = voices.get(id);
  voices.delete(id);
  for (const source of active ?? []) {
    source.onended = () => undefined;
    source.dispose();
  }
}
/** Global trainer cancellation invalidates resources which also own callback jobs. */
export function onScheduledVoicesCancelled(listener: () => void): () => void {
  cancellationListeners.add(listener);
  return () => cancellationListeners.delete(listener);
}
export function scheduledClick(downbeat: boolean, at: number): void {
  const synth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }
  }).toDestination();
  synth.volume.value = downbeat ? -8 : -14;
  clicks.add(synth);
  synth.triggerAttackRelease(downbeat ? "C7" : "G6", 0.03, at);
  const id = Tone.getContext().setTimeout(
    () => {
      synth.dispose();
      clicks.delete(synth);
      cleanup.delete(id);
    },
    Math.max(0, at + 0.15 - Tone.now())
  );
  cleanup.add(id);
}
/** Disconnect owned nodes immediately, including attacks queued for a future audio time. */
export function cancelScheduledVoices(): void {
  for (const listener of cancellationListeners) listener();
  for (const active of voices.values())
    for (const source of active) {
      source.onended = () => undefined;
      source.dispose();
    }
  voices.clear();
  for (const synth of clicks) synth.dispose();
  clicks.clear();
  for (const id of cleanup) Tone.getContext().clearTimeout(id);
  cleanup.clear();
}
