import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Trainer } from "../practice/Trainer";
import type { Grade, TakeReview } from "../recording/compare";
import type { Take } from "../recording/take";
import { FallingNotesView } from "../render/FallingNotesView";
import type { NoteNameStyle } from "../song/musicxml";
import type { Song } from "../song/song";
import type { ComputerKeyboard } from "../render/computerKeys";
import type { KeysPlacement } from "../render/viewGeometry";
import { pianistAvailable } from "../render/three/pianistAvailability";
import type { StaffPrefs } from "./useStaffPrefs";
import { useI18n } from "./useI18n";

export type KeyRange = "song" | "88" | "61" | "49" | "25" | "3oct" | "4oct";

/** Fixed ranges of real keyboards: 88 keys A0-C8, 61 keys C2-C7, 49 keys C2-C6. */
const FIXED_RANGES: Readonly<Record<Exclude<KeyRange, "song">, readonly [number, number]>> = {
  "88": [21, 108],
  "61": [36, 96],
  "49": [36, 84],
  "25": [60, 84],
  "3oct": [48, 83],
  "4oct": [36, 83]
};

/** The song's notes from the C below them to the C above, at least two octaves wide. */
function songRange(song: Song): readonly [number, number] {
  const pitches = song.notes.map((note) => note.pitch);
  if (pitches.length === 0) return [48, 84];
  // A song that starts or ends on a C keeps that C: no octave more past it.
  let low = Math.floor(Math.min(...pitches) / 12) * 12;
  let high = Math.ceil(Math.max(...pitches) / 12) * 12;
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
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly hasScore: boolean;
  readonly viewRef: RefObject<FallingNotesView | null>;
  readonly trainerRef: RefObject<Trainer | null>;
  readonly trainerReady: boolean;
  readonly song: Song;
  readonly baseSong: Song;
  readonly staffPrefs: StaffPrefs;
  readonly cameraInputBlocked?: boolean;
  readonly updateStaffPrefs: (change: Partial<StaffPrefs>) => void;
  readonly fallingNames: NoteNameStyle | undefined;
  readonly comparing: boolean;
  readonly lastTake: { readonly take: Take; readonly review: TakeReview } | null;
  /** The word mode's inputs: the computer keys stand in for the piano's while they are set. */
  readonly computerKeys?: ComputerKeyboard | undefined;
  /** Where the player dragged the keys. */
  readonly placement: KeysPlacement;
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
  cameraInputBlocked = false,
  updateStaffPrefs,
  fallingNames,
  comparing,
  lastTake,
  computerKeys,
  placement
}: Options) {
  const { locale } = useI18n();
  const [handStatus, setHandStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !trainerReady) return;
    view.onHandStatus = setHandStatus;
    return () => {
      view.onHandStatus = undefined;
    };
  }, [viewRef, trainerReady]);
  const localeRef = useRef(locale);
  const comparisonRef = useRef<FallingNotesView | null>(null);
  const fallingStyleRef = useRef(staffPrefs.fallingNoteStyle);
  const freeLayout = staffPrefs.road ? staffPrefs.freePerspectiveField : staffPrefs.freeDirectField;
  const freeLayoutRef = useRef(freeLayout);
  const flatEffectsRef = useRef({
    burning: staffPrefs.flatNoteBurning,
    presses: staffPrefs.flatPressEffects,
    musicalNotes: staffPrefs.noteParticles
  });
  useEffect(() => {
    localeRef.current = locale;
    viewRef.current?.setLocale(locale);
    comparisonRef.current?.setLocale(locale);
  }, [viewRef, trainerReady, locale]);
  // Kept with the other view settings, so a reload brings them back.
  const { labels: showLabels, keyRange } = staffPrefs;
  const setShowLabels = (labels: boolean) => {
    updateStaffPrefs({ labels });
  };
  const setKeyRange = (range: KeyRange) => {
    updateStaffPrefs({ keyRange: range });
  };
  const mirrorHostRef = useRef<HTMLDivElement>(null);

  // The score occupies its own row; the canvas needs no score-overlap offset.
  useEffect(() => {
    viewRef.current?.setHudTop(0);
  }, [viewRef, trainerReady]);

  useEffect(() => {
    viewRef.current?.setFpsVisible(staffPrefs.fps);
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
    viewRef.current?.hands.setStyle(staffPrefs.handStyle);
    viewRef.current?.setCamera(staffPrefs.camera);
    viewRef.current?.setKeyboardTop(
      staffPrefs.keyStyle === "3d" && staffPrefs.keyboardOrientation === "top"
    );
    viewRef.current?.setRoadShape({ far: staffPrefs.roadFar, horizon: staffPrefs.roadHorizon });
  }, [
    viewRef,
    trainerReady,
    showLabels,
    staffPrefs.fps,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands,
    staffPrefs.road,
    staffPrefs.noteCards,
    staffPrefs.keyStyle,
    staffPrefs.handStyle,
    staffPrefs.camera,
    staffPrefs.keyboardOrientation,
    staffPrefs.roadFar,
    staffPrefs.roadHorizon
  ]);

  useEffect(() => {
    viewRef.current?.setComputerKeys(computerKeys);
  }, [viewRef, trainerReady, computerKeys]);

  useEffect(() => {
    viewRef.current?.setRoadGuides(staffPrefs.roadGuides);
    viewRef.current?.setKeyboardDim(staffPrefs.keyboardDim);
    viewRef.current?.setFreeCamera(staffPrefs.freeCamera);
    viewRef.current?.setFreeCameraMovement(staffPrefs.freeCameraWasd && !cameraInputBlocked);
    viewRef.current?.setPerformanceScene(staffPrefs.performanceScene);
    if (viewRef.current)
      viewRef.current.hands.pianist = pianistAvailable(staffPrefs.keyStyle) && staffPrefs.pianist;
  }, [
    viewRef,
    trainerReady,
    staffPrefs.roadGuides,
    staffPrefs.keyboardDim,
    staffPrefs.pianist,
    staffPrefs.keyStyle,
    staffPrefs.handStyle,
    staffPrefs.freeCamera,
    staffPrefs.freeCameraWasd,
    cameraInputBlocked,
    staffPrefs.performanceScene
  ]);

  useEffect(() => {
    flatEffectsRef.current = {
      burning: staffPrefs.flatNoteBurning,
      presses: staffPrefs.flatPressEffects,
      musicalNotes: staffPrefs.noteParticles
    };
    viewRef.current?.flatEffects.set(
      staffPrefs.flatNoteBurning,
      staffPrefs.flatPressEffects,
      staffPrefs.noteParticles
    );
    comparisonRef.current?.flatEffects.set(
      staffPrefs.flatNoteBurning,
      staffPrefs.flatPressEffects,
      staffPrefs.noteParticles
    );
  }, [
    viewRef,
    trainerReady,
    staffPrefs.flatNoteBurning,
    staffPrefs.flatPressEffects,
    staffPrefs.noteParticles
  ]);

  useEffect(() => {
    fallingStyleRef.current = staffPrefs.fallingNoteStyle;
    viewRef.current?.setFallingNoteStyle(staffPrefs.fallingNoteStyle);
    comparisonRef.current?.setFallingNoteStyle(staffPrefs.fallingNoteStyle);
  }, [viewRef, trainerReady, staffPrefs.fallingNoteStyle]);
  const { lift, scale, x, y } = placement;
  useEffect(() => {
    freeLayoutRef.current = freeLayout;
    viewRef.current?.setFreeRoadLayout(freeLayout);
    comparisonRef.current?.setFreeRoadLayout(freeLayout);
  }, [viewRef, trainerReady, freeLayout]);
  useEffect(() => {
    viewRef.current?.setKeysPlacement({ lift, scale, x, y });
  }, [viewRef, trainerReady, lift, scale, x, y]);

  const [rangeLow, rangeHigh] = keyRange === "song" ? songRange(baseSong) : FIXED_RANGES[keyRange];
  useEffect(() => {
    viewRef.current?.setRange(
      rangeLow,
      rangeHigh,
      keyRange === "song",
      keyRange === "3oct" || keyRange === "4oct"
    );
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
    comparisonRef.current = mirror;
    let disposed = false;
    const mounted = mirror.mount(host).then(() => {
      if (disposed) return;
      mirror.setLocale(localeRef.current);
      mirror.setFallingNoteStyle(fallingStyleRef.current);
      mirror.setFreeRoadLayout(freeLayoutRef.current);
      mirror.flatEffects.set(
        flatEffectsRef.current.burning,
        flatEffectsRef.current.presses,
        flatEffectsRef.current.musicalNotes
      );
      mirror.setSong(song);
      mirror.setShowLabels(showLabels);
      mirror.setFpsVisible(staffPrefs.fps);
      mirror.setNoteNames(fallingNames);
      // The same parts as the main view, or the two lanes run at different speeds.
      mirror.setParts({ notes: staffPrefs.lane, keys: staffPrefs.keys, hands: staffPrefs.hands });
      mirror.setRange(rangeLow, rangeHigh, false, keyRange === "3oct" || keyRange === "4oct");
      trainer.setComparison({
        colorOf: (note) => playedTint.get(note.id),
        mirror: { view: mirror, colorOf: (note) => gradeOf.get(note.id) }
      });
    });
    return () => {
      disposed = true;
      if (comparisonRef.current === mirror) comparisonRef.current = null;
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
    staffPrefs.fps,
    rangeLow,
    rangeHigh,
    keyRange,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands
  ]);

  return { showLabels, setShowLabels, keyRange, setKeyRange, mirrorHostRef, handStatus };
}
