/** A note of the score on screen: the beat it starts on, its x and the top of its line. */
export interface BeatSpot {
  readonly beat: number;
  readonly x: number;
  /** The top of the note's line of music: notes of one line share it. */
  readonly line: number;
}

/** The written entry at the live beat; fractional onsets and rests use the same clock. */
export function entryBeatAt(spots: readonly BeatSpot[], beat: number): number | undefined {
  if (spots.length === 0 || !Number.isFinite(beat)) return undefined;
  let low = 0;
  let high = spots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((spots[middle]?.beat ?? Infinity) <= beat) low = middle + 1;
    else high = middle;
  }
  return spots[Math.max(0, low - 1)]?.beat;
}

/**
 * Where the play cursor stands at `beat`: between the notes around it, so it
 * glides with the song's own time rather than jumping from note to note. A
 * line break is no glide: the cursor waits at the line's last note, then
 * starts the next line at its first. Before the first note it stands on it,
 * past the last on the last.
 */
export function spotAt(
  spots: readonly BeatSpot[],
  beat: number
): { readonly x: number; readonly line: number } | undefined {
  const first = spots[0];
  if (!first) return undefined;
  if (beat <= first.beat) return first;
  for (let index = 1; index < spots.length; index++) {
    const after = spots[index];
    const before = spots[index - 1];
    if (!after || !before) break;
    if (beat < after.beat) {
      if (after.line !== before.line) return before;
      const share = (beat - before.beat) / (after.beat - before.beat);
      return { x: before.x + share * (after.x - before.x), line: before.line };
    }
  }
  return spots.at(-1);
}

/**
 * Puts the play cursor `line` (an element in the scrolling `host`) where the
 * song is at `beat`, over the whole height of the note's line of music.
 * Hidden while the score has no notes laid out.
 */
export function placeCursorLine(
  host: HTMLElement | null,
  line: HTMLElement | null,
  spots: readonly BeatSpot[],
  lines: readonly { readonly top: number; readonly bottom: number }[],
  beat: number
): void {
  if (!line) return;
  const svg = host?.querySelector("svg");
  const spot = spotAt(spots, beat);
  const box = spot && lines.find((item) => item.top === spot.line);
  if (!host || !svg || !spot || !box) {
    line.style.visibility = "hidden";
    return;
  }
  const origin = svg.getBoundingClientRect();
  const view = host.getBoundingClientRect();
  const left = origin.left - view.left + host.scrollLeft + spot.x;
  const top = origin.top - view.top + host.scrollTop + box.top;
  line.style.visibility = "visible";
  line.style.transform = `translate(${String(left)}px, ${String(top)}px)`;
  line.style.height = `${String(box.bottom - box.top)}px`;
}
