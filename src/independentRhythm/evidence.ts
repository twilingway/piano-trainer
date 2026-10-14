import { twoHandOwner } from "../reading/twoHandEvidence";
import { rhythmClockAt, rhythmPerformanceAt } from "./clock";
import { summarizeIndependentRhythmOutcomes } from "./progress";
import type {
  IndependentRhythmClockReceipt,
  IndependentRhythmConfig,
  IndependentRhythmEvent,
  IndependentRhythmExtra,
  IndependentRhythmNoteOutcome,
  IndependentRhythmPhaseExercise,
  IndependentRhythmSummary
} from "./types";

export interface IndependentRhythmEvaluation {
  readonly outcomes: readonly IndependentRhythmNoteOutcome[];
  readonly extras: readonly IndependentRhythmExtra[];
  readonly summary: IndependentRhythmSummary;
  readonly channel: number | null;
}
export function selectedRhythmOrigin(
  config: IndependentRhythmConfig,
  event: IndependentRhythmEvent
): boolean {
  return (
    config.source === event.source &&
    (event.offsetMs ?? 0) === config.offsetMs &&
    (config.source !== "midi" ||
      (event.deviceId === config.deviceId &&
        Number.isInteger(event.channel) &&
        (event.channel ?? 0) >= 1 &&
        (event.channel ?? 17) <= 16))
  );
}
/** Delivery chooses the MIDI channel; raw ordering chooses physical attacks and matching. */
export function evaluateIndependentRhythm(
  phase: IndependentRhythmPhaseExercise,
  config: IndependentRhythmConfig,
  events: readonly IndependentRhythmEvent[],
  clock: IndependentRhythmClockReceipt
): IndependentRhythmEvaluation {
  let channel = config.channel ?? null;
  const deliveryFresh = new Map<string, IndependentRhythmEvent>();
  const releasePrefix = new Map<string, number>();
  for (const event of events) {
    const owner = twoHandOwner(event);
    const prior = deliveryFresh.get(owner);
    if (event.kind === "up") {
      releasePrefix.set(owner, Math.max(releasePrefix.get(owner) ?? -1, event.atMs));
      if (prior && event.atMs >= prior.atMs) deliveryFresh.delete(owner);
      continue;
    }
    const held = [...deliveryFresh.values()].some(
      (value) =>
        value.pitch === event.pitch &&
        value.source === event.source &&
        value.deviceId === event.deviceId &&
        value.channel === event.channel
    );
    const fresh = !prior && event.atMs >= (releasePrefix.get(owner) ?? -1);
    if (fresh) deliveryFresh.set(owner, event);
    const songTime = rhythmClockAt(clock.segments, event.atMs - config.offsetMs);
    if (
      channel === null &&
      config.source === "midi" &&
      fresh &&
      !held &&
      selectedRhythmOrigin(config, event) &&
      songTime !== undefined &&
      songTime >= -0.15 - 1e-8 &&
      songTime < phase.song.duration
    )
      channel = event.channel ?? null;
  }
  const outcomes: IndependentRhythmNoteOutcome[] = phase.song.notes.map((note) => ({
    noteId: note.id,
    pitch: note.pitch,
    hand: note.hand,
    onset: note.start,
    outcome: "pending",
    eventSequence: null,
    deviationMs: null
  }));
  const extras: IndependentRhythmExtra[] = [];
  const held = new Map<string, IndependentRhythmEvent>();
  for (const event of events.toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)) {
    const owner = twoHandOwner(event);
    if (event.kind === "up") {
      held.delete(owner);
      continue;
    }
    if (held.has(owner)) continue;
    const wasHeld = [...held.values()].some(
      (down) =>
        down.pitch === event.pitch &&
        down.source === event.source &&
        down.deviceId === event.deviceId &&
        down.channel === event.channel
    );
    held.set(owner, event);
    if (
      wasHeld ||
      !selectedRhythmOrigin(config, event) ||
      (config.source === "midi" && event.channel !== channel)
    )
      continue;
    const songTime = rhythmClockAt(clock.segments, event.atMs - config.offsetMs);
    if (songTime === undefined || songTime < -0.15 - 1e-8 || songTime >= phase.song.duration)
      continue;
    const match = outcomes
      .filter(
        (note) =>
          note.outcome === "pending" &&
          note.pitch === event.pitch &&
          Math.abs(songTime - note.onset) <= 0.15 + 1e-8
      )
      .toSorted(
        (a, b) =>
          Math.abs(songTime - a.onset) - Math.abs(songTime - b.onset) ||
          a.onset - b.onset ||
          a.noteId.localeCompare(b.noteId)
      )[0];
    if (match) {
      const index = outcomes.indexOf(match);
      outcomes[index] = {
        ...match,
        outcome: "hit",
        eventSequence: event.sequence,
        deviationMs: Math.round((songTime - match.onset) * 1e9) / 1e6
      };
    } else
      extras.push({
        eventSequence: event.sequence,
        pitch: event.pitch,
        hand: event.pitch === 48 ? "left" : event.pitch === 60 ? "right" : null,
        songTime
      });
  }
  for (let index = 0; index < outcomes.length; index++) {
    const note = outcomes[index];
    if (note?.outcome !== "pending") continue;
    const crossing = rhythmPerformanceAt(clock.segments, note.onset + 0.15);
    if (
      crossing !== null &&
      clock.atMs >= crossing &&
      clock.atMs > crossing + Math.max(0, config.offsetMs) + 250
    )
      outcomes[index] = { ...note, outcome: "miss" };
  }
  return {
    outcomes,
    extras,
    summary: summarizeIndependentRhythmOutcomes(outcomes, extras),
    channel
  };
}
