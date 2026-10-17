import type { SongNote } from "../song/song";
import type { KeyRect } from "./keyboardLayout";
import type { NotesFrame } from "./NotesLayer";
import type { NoteLook } from "./noteLook";
import { ROAD_TRAIL_MAX_GAP_SHARE } from "./three/roadTrailGeometry";

interface TrailLink {
  readonly previous: SongNote;
  readonly next: SongNote;
  readonly gap: number;
}

interface TrailRoad {
  readonly drawsNativeRoad: boolean;
  addTrailAnchor(x: number, width: number, color: number, alpha: number): void;
}

/** Score-derived links remain deterministic through seeks and never retain a rendered note. */
export class RoadTrailAnchors {
  private readonly links: TrailLink[] = [];

  constructor(notes: readonly SongNote[]) {
    const previous = new Map<number, SongNote>();
    const sorted = [...notes].sort((a, b) => a.start - b.start || a.duration - b.duration);
    for (const next of sorted) {
      const end = next.start + next.duration;
      if (!Number.isFinite(next.start) || !Number.isFinite(end) || next.duration <= 0) continue;
      const prior = previous.get(next.pitch);
      const priorEnd = prior ? prior.start + prior.duration : -Infinity;
      if (prior && next.start > priorEnd)
        this.links.push({ previous: prior, next, gap: next.start - priorEnd });
      // A sustained or overlapping voice blocks the lane until its farthest end.
      if (end >= priorEnd) previous.set(next.pitch, next);
    }
  }

  draw(
    frame: NotesFrame,
    keys: ReadonlyMap<number, KeyRect>,
    look: NoteLook,
    road: TrailRoad | undefined
  ): void {
    if (!road?.drawsNativeRoad) return;
    const gapLimit = frame.lookAhead * ROAD_TRAIL_MAX_GAP_SHARE;
    for (const { previous, next, gap } of this.links) {
      if (next.start <= frame.time) continue;
      if (next.start > frame.time + frame.lookAhead) break;
      if (previous.start + previous.duration > frame.time || gap > gapLimit) continue;
      const key = keys.get(next.pitch);
      if (!key) continue;
      const color =
        frame.colorOf?.(previous) ??
        (frame.statusOf(previous.id) === "missed" ? 0xff2454 : look.color(previous));
      road.addTrailAnchor(key.x + key.width / 2, key.width * 1.08, color, 1);
    }
  }
}
