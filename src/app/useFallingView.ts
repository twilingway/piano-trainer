import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { Trainer } from "../practice/Trainer";
import type { Grade, TakeReview } from "../recording/compare";
import type { Take } from "../recording/take";
import { FallingNotesView } from "../render/FallingNotesView";
import type { NoteNameStyle } from "../song/musicxml";
import type { Song } from "../song/song";
import type { StaffPrefs } from "./useStaffPrefs";

export type KeyRange = "song" | "88" | "61" | "49";

/** Fixed ranges of real keyboards: 88 keys A0-C8, 61 keys C2-C7, 49 keys C2-C6. */
const FIXED_RANGES: Readonly<Record<Exclude<KeyRange, "song">, readonly [number, number]>> = {
  "88": [21, 108],
  "61": [36, 96],
  "49": [36, 84]
};

/** The song's notes from the C below them to the C above, at least two octaves wide. */
function songRange(song: Song): readonly [number, number] {
  const pitches = song.notes.map((note) => note.pitch);
  if (pitches.length === 0) return [48, 84];
  let low = Math.floor((Math.min(...pitches) - 1) / 12) * 12;
  let high = Math.ceil((Math.max(...pitches) + 1) / 12) * 12;
  while (high - low < 24) {
    low -= 12;
    if (high - low < 24) high += 12;
  }
  return [Math.max(21, low), Math.min(108, high)];
}

/** The same grades as tints for the falling notes; a key that belongs to no note is red too. */
const GRADE_TINTS: Readonly<Record<Grade, number>> = {
  good: 0x2e9e4f,
  inaccurate: 0xe08a00,
  missed: 0xe63946
};
const EXTRA_TINT = 0xe63946;

interface Options {
  readonly viewRef: RefObject<FallingNotesView | null>;
  readonly trainerRef: RefObject<Trainer | null>;
  readonly trainerReady: boolean;
  readonly song: Song;
  readonly baseSong: Song;
  readonly staffPrefs: StaffPrefs;
  readonly updateStaffPrefs: (change: Partial<StaffPrefs>) => void;
  readonly fallingNames: NoteNameStyle | undefined;
  readonly comparing: boolean;
  readonly lastTake: { readonly take: Take; readonly review: TakeReview } | null;
}

/**
 * What the falling notes show: labels, names, parts, the key range, and the
 * original on a second screen while a take is compared with it.
 */
export function useFallingView({
  viewRef,
  trainerRef,
  trainerReady,
  song,
  baseSong,
  staffPrefs,
  updateStaffPrefs,
  fallingNames,
  comparing,
  lastTake
}: Options) {
  // Kept with the other view settings, so a reload brings them back.
  const { labels: showLabels, keyRange } = staffPrefs;
  const setShowLabels = (labels: boolean) => {
    updateStaffPrefs({ labels });
  };
  const setKeyRange = (range: KeyRange) => {
    updateStaffPrefs({ keyRange: range });
  };
  const mirrorHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewRef.current?.setShowLabels(showLabels);
    viewRef.current?.setNoteNames(fallingNames);
    viewRef.current?.setParts({
      notes: staffPrefs.lane,
      keys: staffPrefs.keys,
      hands: staffPrefs.hands
    });
    viewRef.current?.setRoad(staffPrefs.road);
    viewRef.current?.setNoteCards(staffPrefs.noteCards);
    viewRef.current?.setKeyStyle(staffPrefs.keyStyle);
    viewRef.current?.setRoadShape({ far: staffPrefs.roadFar, horizon: staffPrefs.roadHorizon });
  }, [
    viewRef,
    trainerReady,
    showLabels,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands,
    staffPrefs.road,
    staffPrefs.noteCards,
    staffPrefs.keyStyle,
    staffPrefs.roadFar,
    staffPrefs.roadHorizon
  ]);

  const [rangeLow, rangeHigh] = keyRange === "song" ? songRange(baseSong) : FIXED_RANGES[keyRange];
  useEffect(() => {
    viewRef.current?.setRange(rangeLow, rangeHigh, keyRange === "song");
  }, [viewRef, trainerReady, rangeLow, rangeHigh, keyRange]);

  // The original on a second screen, drawn by the trainer at the take's song time.
  useEffect(() => {
    const host = mirrorHostRef.current;
    const trainer = trainerRef.current;
    if (!comparing || !host || !trainer || !lastTake) return;
    const { take, review: taken } = lastTake;
    const gradeOf = new Map(taken.notes.map((item) => [item.note.id, GRADE_TINTS[item.grade]]));
    const playedTint = new Map<string, number>();
    take.notes.forEach((played, index) => {
      const owed = taken.notes.find((item) => item.played === played);
      playedTint.set(`take${String(index)}`, owed ? GRADE_TINTS[owed.grade] : EXTRA_TINT);
    });
    const mirror = new FallingNotesView();
    let disposed = false;
    const mounted = mirror.mount(host).then(() => {
      if (disposed) return;
      mirror.setSong(song);
      mirror.setShowLabels(showLabels);
      mirror.setNoteNames(fallingNames);
      // The same parts as the main view, or the two lanes run at different speeds.
      mirror.setParts({ notes: staffPrefs.lane, keys: staffPrefs.keys, hands: staffPrefs.hands });
      mirror.setRange(rangeLow, rangeHigh);
      trainer.setComparison({
        colorOf: (note) => playedTint.get(note.id),
        mirror: { view: mirror, colorOf: (note) => gradeOf.get(note.id) }
      });
    });
    return () => {
      disposed = true;
      trainer.setComparison(undefined);
      void mounted.then(() => {
        mirror.destroy();
      });
    };
  }, [
    trainerRef,
    comparing,
    lastTake,
    song,
    showLabels,
    rangeLow,
    rangeHigh,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands
  ]);

  return { showLabels, setShowLabels, keyRange, setKeyRange, mirrorHostRef };
}
