import type { HudLayer } from "./HudLayer";
import type { SongNote } from "../song/song";
import { noteColor } from "./computerKeys";
import type { ComputerKeys } from "./computerKeys";
import type { FrameState } from "./frameState";
import type { FxKey, FxLayer } from "./FxLayer";
import type { KeyRect } from "./keyboardLayout";
import type { RoadLayer, Strike } from "./RoadLayer";

/** Sounding notes light the road at their key centers, including the program's accompaniment. */
export function viewStrikes(
  playing: ReadonlyMap<number, SongNote>,
  state: FrameState,
  keys: ReadonlyMap<number, KeyRect>,
  computer: ComputerKeys | undefined
): Strike[] {
  const strikes: Strike[] = [];
  for (const [pitch, note] of playing) {
    const key = keys.get(pitch);
    // The player's own notes while held, and the program's while it sounds them.
    const own = state.owns(note) && state.pressed.has(pitch);
    if (!key || !(own || state.sounding.has(pitch))) continue;
    strikes.push({ pitch, x: key.x + key.width / 2, color: noteColor(note, computer) });
  }
  return strikes;
}

/** Drive the existing strike flashes and held-key fire from the shared frame snapshot. */
export function drawViewEffects(
  fx: Pick<FxLayer, "draw">,
  state: FrameState,
  playing: ReadonlyMap<number, SongNote>,
  keys: ReadonlyMap<number, KeyRect>,
  computer: ComputerKeys | undefined,
  road: RoadLayer | undefined,
  pan: number,
  hitY: number,
  wasSounding: Set<number>,
  deltaSeconds: number
): void {
  const hitLineY = road ? road.hitLineY : hitY;
  const fxKey = (pitch: number): FxKey | undefined => {
    const key = keys.get(pitch);
    if (!key) return undefined;
    const note = playing.get(pitch) ?? state.due.find((item) => item.pitch === pitch);
    const color = note ? noteColor(note, computer) : 0xffffff;
    const projected = road?.notePlace(key.x + key.width / 2, hitY);
    return {
      pitch,
      x: projected?.x ?? key.x + key.width / 2 - pan,
      width: key.width * (projected?.scale ?? 1),
      y: projected?.y ?? hitLineY,
      color
    };
  };
  const struck: FxKey[] = [];
  for (const strike of state.graded ?? []) {
    const key = strike.grade === "miss" ? undefined : fxKey(strike.pitch);
    if (key) struck.push(key);
  }
  // The program's own notes, for the hand the player leaves to it, flash as they sound.
  for (const pitch of state.sounding) {
    const key = wasSounding.has(pitch) ? undefined : fxKey(pitch);
    if (key) struck.push(key);
  }
  wasSounding.clear();
  for (const pitch of state.sounding) wasSounding.add(pitch);
  // A note burns away on its key while it sounds: the player's held notes and the program's.
  const sounding: FxKey[] = [];
  for (const [pitch, note] of playing) {
    const own = state.owns(note) && state.pressed.has(pitch);
    const key = own || state.sounding.has(pitch) ? fxKey(pitch) : undefined;
    if (key) sounding.push(key);
  }
  fx.draw(struck, sounding, hitLineY, deltaSeconds);
}

/** Transient grades keep their screen HUD ownership in every camera mode. */
export function drawViewHud(
  hud: Pick<HudLayer, "draw">,
  state: FrameState,
  keys: ReadonlyMap<number, KeyRect>,
  road: RoadLayer | undefined,
  pan: number,
  hitY: number,
  hitLineY: number,
  deltaSeconds: number
): void {
  hud.draw(
    undefined,
    state.graded ?? [],
    (pitch) => {
      const key = keys.get(pitch);
      return (
        key && (road?.notePlace(key.x + key.width / 2, hitY)?.x ?? key.x + key.width / 2 - pan)
      );
    },
    hitLineY,
    deltaSeconds
  );
}
