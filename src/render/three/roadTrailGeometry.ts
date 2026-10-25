import type { WorldRoadNote } from "./roadNoteGeometry";

export const ROAD_TRAIL_CAPACITY = 1024;
export const ROAD_TRAIL_MAX_GAP = 500;
export const ROAD_TRAIL_MAX_GAP_SHARE = 0.22;
export const ROAD_TRAIL_ANCHOR_CAPACITY = 88;
const NO_ANCHORS: readonly WorldRoadNote[] = [];

interface LaneNote extends WorldRoadNote {
  active: boolean;
  originalTop: number;
}

const emptyNote = (): WorldRoadNote => ({ x: 0, top: 0, bottom: 0, width: 0, color: 0, alpha: 0 });
const compareNotes = (a: LaneNote, b: LaneNote): number => {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (!a.active) return 0;
  return (
    a.x - b.x ||
    (a.lane?.y ?? 0) - (b.lane?.y ?? 0) ||
    a.bottom - b.bottom ||
    a.top - b.top ||
    a.color - b.color
  );
};
const mixColor = (a: number, b: number): number => {
  const red = Math.round((((a >> 16) & 255) + ((b >> 16) & 255)) / 2);
  const green = Math.round((((a >> 8) & 255) + ((b >> 8) & 255)) / 2);
  const blue = Math.round(((a & 255) + (b & 255)) / 2);
  return (red << 16) | (green << 8) | blue;
};

/** Pure, reusable selection of the empty gaps between successive notes of the same lane. */
export class RoadTrailSelection {
  readonly capacity: number;
  readonly trails: readonly WorldRoadNote[];
  private readonly output: WorldRoadNote[];
  private readonly entries: LaneNote[];

  constructor(capacity = ROAD_TRAIL_CAPACITY) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(ROAD_TRAIL_CAPACITY, Math.floor(capacity)))
      : ROAD_TRAIL_CAPACITY;
    this.output = Array.from({ length: this.capacity }, emptyNote);
    this.trails = this.output;
    this.entries = Array.from({ length: this.capacity + ROAD_TRAIL_ANCHOR_CAPACITY }, () => ({
      ...emptyNote(),
      active: false,
      originalTop: 0
    }));
  }

  update(
    notes: readonly WorldRoadNote[],
    noteCount = notes.length,
    maxGap = ROAD_TRAIL_MAX_GAP,
    anchors: readonly WorldRoadNote[] = NO_ANCHORS,
    anchorCount = anchors.length
  ): number {
    const limit = Number.isFinite(noteCount)
      ? Math.max(0, Math.min(notes.length, Math.floor(noteCount)))
      : notes.length;
    const gapLimit = Number.isFinite(maxGap) ? Math.max(0, maxGap) : ROAD_TRAIL_MAX_GAP;
    const anchorLimit = Number.isFinite(anchorCount)
      ? Math.max(0, Math.min(anchors.length, ROAD_TRAIL_ANCHOR_CAPACITY, Math.floor(anchorCount)))
      : Math.min(anchors.length, ROAD_TRAIL_ANCHOR_CAPACITY);
    let count = this.append(notes, limit, 0, false);
    count = this.append(anchors, anchorLimit, count, true);
    for (let index = count; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (entry) entry.active = false;
    }
    if (count < 2 || gapLimit <= 0) return 0;
    this.entries.sort(compareNotes);
    let previous: LaneNote | undefined;
    let used = 0;
    for (let index = 0; index < count; index++) {
      const current = this.entries[index];
      if (!current) continue;
      if (previous?.x !== current.x || previous.lane?.y !== current.lane?.y) {
        previous = current;
        continue;
      }
      if (current.bottom <= previous.top) {
        // A sustained or overlapping voice blocks the gap until its farthest end.
        if (current.top > previous.top) previous = current;
        continue;
      }
      // Readable tails may extend or trim the body; only the score interval decides eligibility.
      const gap = current.bottom - previous.originalTop;
      const target = this.output[used];
      if (gap <= gapLimit && target) {
        target.x = current.x;
        target.top = current.bottom;
        target.bottom = previous.top;
        target.width = Math.min(previous.width, current.width) * 0.65;
        target.color = mixColor(previous.color, current.color);
        target.alpha = Math.min(1, previous.alpha, current.alpha);
        target.pitch = current.pitch;
        target.lane = current.lane;
        used++;
      }
      previous = current;
    }
    return used;
  }

  private append(
    notes: readonly WorldRoadNote[],
    limit: number,
    count: number,
    point: boolean
  ): number {
    for (let index = 0; index < limit && (point || count < this.capacity); index++) {
      const note = notes[index];
      const target = this.entries[count];
      const originalTop = note ? note.top + (note.textureOffset ?? 0) : NaN;
      if (
        !note ||
        !target ||
        !Number.isFinite(note.x) ||
        !Number.isFinite(note.top) ||
        !Number.isFinite(note.bottom) ||
        !Number.isFinite(note.width) ||
        !Number.isFinite(note.color) ||
        !Number.isFinite(note.alpha) ||
        !Number.isFinite(originalTop) ||
        (point ? note.top !== note.bottom : note.top <= note.bottom) ||
        note.width <= 0 ||
        note.alpha <= 0
      )
        continue;
      target.x = note.x;
      target.top = note.top;
      target.bottom = note.bottom;
      target.width = note.width;
      target.color = note.color;
      target.alpha = note.alpha;
      target.pitch = note.pitch;
      target.lane = note.lane;
      target.originalTop = originalTop;
      target.active = true;
      count++;
    }
    return count;
  }
}
