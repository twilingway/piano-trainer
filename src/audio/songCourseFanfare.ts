import * as Tone from "tone";
import type { SongCourseResult } from "../songCourse/model";

/** An original four-note cadence; no transport or musical grading runs here. */
export function createSongCourseFanfare() {
  const heard = new Set<string>();
  let voice: Tone.PolySynth | undefined;
  return {
    play(result: SongCourseResult, muted = false): void {
      if (heard.has(result.runId)) return;
      heard.add(result.runId);
      if (muted || !result.completed || !result.valid) return;
      try {
        if (Tone.getContext().state !== "running") return;
        voice ??= new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.12, sustain: 0.1, release: 0.2 },
          volume: -18
        }).toDestination();
        const now = Tone.now();
        ["C5", "E5", "G5"].forEach((note, index) =>
          voice?.triggerAttackRelease(note, 0.12, now + index * 0.14)
        );
        voice.triggerAttackRelease(["C5", "E5", "G5", "C6"], 0.35, now + 0.45);
      } catch {
        /* A suspended or unavailable audio context never hides the visual result. */
      }
    },
    dispose(): void {
      voice?.dispose();
      voice = undefined;
    }
  };
}
