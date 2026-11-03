import type { SongNote } from "../song/song";
import type { KeysLayer } from "./ComputerKeyboardLayer";
import type { FrameState } from "./frameState";
import type { HandsLayer } from "./HandsLayer";
import type { KeyRect } from "./keyboardLayout";
import type { RoadLayer } from "./RoadLayer";
import type { Geometry, ViewParts } from "./viewGeometry";
import { NativeKeyContacts } from "./three/NativeKeyContacts";

const contactsByHands = new WeakMap<HandsLayer, NativeKeyContacts>();
const NO_SOUNDING_KEYS: ReadonlySet<number> = new Set();

/** Display mode switches keep native/sprite hand visibility consistent with the shown keys. */
export function syncViewKeyboards(
  parts: ViewParts,
  computer: boolean,
  keyboard: KeysLayer | undefined,
  typing: KeysLayer | undefined,
  hands: HandsLayer
): void {
  if (keyboard) keyboard.container.visible = parts.keys && !computer;
  if (typing) typing.container.visible = parts.keys && computer;
  hands.container.visible = parts.hands && parts.keys && !computer;
  if (!hands.container.visible) hands.reset();
}

/** The frame's key colours and hand poses read the same session snapshot. */
export function drawViewKeys(
  layer: KeysLayer | undefined,
  hands: HandsLayer,
  keys: ReadonlyMap<number, KeyRect>,
  geometry: Geometry,
  labels: boolean,
  state: FrameState,
  playing: ReadonlyMap<number, SongNote>,
  road: RoadLayer | undefined,
  pan: number,
  deltaSeconds: number
): void {
  let contacts = contactsByHands.get(hands);
  if (!contacts) contactsByHands.set(hands, (contacts = new NativeKeyContacts()));
  contacts.setNotes(hands.songNotes);
  const sounding = state.hands.size === 0 ? state.sounding : NO_SOUNDING_KEYS;
  const physicalDown = new Set(state.pressed);
  for (const pitch of sounding)
    if (!contacts.has(pitch) || contacts.down(pitch, state.time)) physicalDown.add(pitch);
  layer?.draw(
    {
      pressed: state.pressed,
      sounding,
      physicalDown,
      due: state.due,
      hintTime: state.hintTime ?? state.time,
      hintSpeed: state.hintSpeed ?? 1,
      waiting: (state.waitingFor?.length ?? 0) > 0,
      ...(state.hintNotes ? { hintNotes: state.hintNotes } : {}),
      playing,
      ...(state.hints === undefined ? {} : { hints: state.hints }),
      ...(state.fingerCues === undefined ? {} : { fingerCues: state.fingerCues }),
      ...(state.neutralKeys === undefined ? {} : { neutralKeys: state.neutralKeys })
    },
    keys,
    geometry,
    labels
  );
  // The native pianist reads this same session snapshot even when sprite hands are hidden.
  hands.time = state.time;
  if (hands.container.visible)
    hands.draw(
      state.time,
      deltaSeconds,
      state.hands,
      keys,
      geometry,
      (x, y, reach) => (road ? road.handPlace(x, y, geometry, reach) : { x: x - pan, y }),
      state.waitingFor ?? [],
      state.hintSpeed ?? 1
    );
}
