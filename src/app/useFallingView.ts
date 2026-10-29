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
import { DEFAULT_WORLD_FOV } from "../render/worldFov";
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

/** How a lane looks; the original takes the take's, so the two line up key for key. */
interface LaneLook {
  readonly fps: boolean;
  readonly labels: boolean;
  readonly names: NoteNameStyle | undefined;
  readonly parts: { readonly notes: boolean; readonly keys: boolean; readonly hands: boolean };
  readonly road: StaffPrefs["road"];
  readonly noteCards: StaffPrefs["noteCards"];
  readonly keyStyle: StaffPrefs["keyStyle"];
  readonly handStyle: StaffPrefs["handStyle"];
  readonly camera: StaffPrefs["camera"];
  readonly keyboardTop: boolean;
  readonly roadShape: Parameters<FallingNotesView["setRoadShape"]>[0];
}

function applyLaneLook(view: FallingNotesView, look: LaneLook): void {
  view.setFpsVisible(look.fps);
  view.setShowLabels(look.labels);
  view.setNoteNames(look.names);
  view.setParts(look.parts);
  view.setRoad(look.road);
  view.setNoteCards(look.noteCards);
  view.setKeyStyle(look.keyStyle);
  view.hands.setStyle(look.handStyle);
  view.setCamera(look.camera);
  view.setKeyboardTop(look.keyboardTop);
  view.setRoadShape(look.roadShape);
}

/** The scene settings both lanes share; camera input, the pianist and the stage stay the take's. */
interface LaneScene {
  readonly roadGuides: boolean;
  readonly keyboardDim: StaffPrefs["keyboardDim"];
  readonly worldFov: number;
  readonly freeCamera: StaffPrefs["freeCamera"];
}

function applyLaneScene(view: FallingNotesView, scene: LaneScene): void {
  view.setRoadGuides(scene.roadGuides);
  view.setKeyboardDim(scene.keyboardDim);
  view.setWorldFov(scene.worldFov);
  view.setFreeCamera(scene.freeCamera);
}

/** The take's lane and, while comparing, the original's. */
function lanes(...refs: readonly RefObject<FallingNotesView | null>[]): FallingNotesView[] {
  return refs.map((ref) => ref.current).filter((view) => view !== null);
}

interface LaneRange {
  readonly low: number;
  readonly high: number;
  readonly fitsSong: boolean;
  readonly fitsViewport: boolean;
}

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
  // A callback ref into state: the runtime turns comparing on before the workspace renders the
  // second lane, so the comparison effect has to run again once the lane is there.
  const [mirrorHost, mirrorHostRef] = useState<HTMLDivElement | null>(null);

  // The score occupies its own row; the canvas needs no score-overlap offset.
  useEffect(() => {
    viewRef.current?.setHudTop(0);
  }, [viewRef, trainerReady]);

  const lookRef = useRef<LaneLook | null>(null);
  const sceneRef = useRef<LaneScene | null>(null);
  const placementRef = useRef<KeysPlacement>(placement);
  const rangeRef = useRef<LaneRange | null>(null);

  useEffect(() => {
    const look: LaneLook = {
      fps: staffPrefs.fps,
      labels: showLabels,
      names: fallingNames,
      // The same parts in both lanes, or the two run at different speeds.
      parts: { notes: staffPrefs.lane, keys: staffPrefs.keys, hands: staffPrefs.hands },
      road: staffPrefs.road,
      noteCards: staffPrefs.noteCards,
      keyStyle: staffPrefs.keyStyle,
      handStyle: staffPrefs.handStyle,
      camera: staffPrefs.camera,
      keyboardTop: staffPrefs.keyStyle === "3d" && staffPrefs.keyboardOrientation === "top",
      roadShape: {
        far: staffPrefs.roadFar,
        horizon: staffPrefs.roadHorizon,
        fit: {
          mode: staffPrefs.roadFit,
          camera: staffPrefs.roadFitCamera ?? undefined,
          tilt: staffPrefs.roadNoteTilt
        }
      }
    };
    lookRef.current = look;
    for (const view of lanes(viewRef, comparisonRef)) applyLaneLook(view, look);
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
    staffPrefs.roadHorizon,
    staffPrefs.roadFit,
    staffPrefs.roadFitCamera,
    staffPrefs.roadNoteTilt
  ]);

  useEffect(() => {
    viewRef.current?.setComputerKeys(computerKeys);
  }, [viewRef, trainerReady, computerKeys]);

  useEffect(() => {
    const scene: LaneScene = {
      roadGuides: staffPrefs.roadGuides,
      keyboardDim: staffPrefs.keyboardDim,
      worldFov: staffPrefs.worldFov,
      freeCamera: staffPrefs.freeCamera
    };
    sceneRef.current = scene;
    for (const view of lanes(viewRef, comparisonRef)) applyLaneScene(view, scene);
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
    staffPrefs.worldFov,
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
    placementRef.current = { lift, scale, x, y };
    for (const view of lanes(viewRef, comparisonRef)) view.setKeysPlacement({ lift, scale, x, y });
  }, [viewRef, trainerReady, lift, scale, x, y]);

  const [rangeLow, rangeHigh] = keyRange === "song" ? songRange(baseSong) : FIXED_RANGES[keyRange];
  useEffect(() => {
    const range: LaneRange = {
      low: rangeLow,
      high: rangeHigh,
      fitsSong: keyRange === "song",
      fitsViewport: keyRange === "3oct" || keyRange === "4oct"
    };
    rangeRef.current = range;
    for (const view of lanes(viewRef, comparisonRef))
      view.setRange(range.low, range.high, range.fitsSong, range.fitsViewport);
  }, [viewRef, trainerReady, rangeLow, rangeHigh, keyRange]);

  // The original on a second screen, drawn by the trainer at the take's song time.
  useEffect(() => {
    const host = mirrorHost;
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
      if (lookRef.current) applyLaneLook(mirror, lookRef.current);
      if (sceneRef.current) applyLaneScene(mirror, sceneRef.current);
      mirror.setKeysPlacement(placementRef.current);
      const range = rangeRef.current;
      if (range) mirror.setRange(range.low, range.high, range.fitsSong, range.fitsViewport);
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
  }, [trainerRef, mirrorHost, comparing, lastTake, song]);

  const resetWorldCamera = () => {
    // The world reset also drops the straightening snapshot; its mode stays.
    updateStaffPrefs({ worldFov: DEFAULT_WORLD_FOV, roadFitCamera: null });
    viewRef.current?.setWorldFov(DEFAULT_WORLD_FOV, true);
  };
  return {
    showLabels,
    setShowLabels,
    keyRange,
    setKeyRange,
    resetWorldCamera,
    mirrorHostRef,
    handStatus
  };
}
