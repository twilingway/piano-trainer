import type { Finger } from "../fingering/fingering";
import type { HandSpriteDefinition } from "./handSpriteCatalog";
import catalog from "./hands/rendered/catalog.json";

/** URLs only: a picture is fetched when the 3D style asks for it, not with the bundle. */
const URLS = import.meta.glob<string>("./hands/rendered/*.webp", {
  query: "?url",
  import: "default",
  eager: true
});

const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/**
 * The 3D hand: right-hand renders of one Blender model from straight above, one scale for all,
 * fingertip pads projected from the posed mesh (tools/hand-rig: game_tips.py, export.py).
 */
export const HAND_RENDERS: readonly HandSpriteDefinition[] = Object.entries(catalog.poses).flatMap(
  ([id, pose]) => {
    const url = URLS[`./hands/rendered/${id}.webp`];
    const tips = pose.tips as Readonly<Record<string, { x: number; y: number } | undefined>>;
    if (!url || FINGERS.some((finger) => !tips[finger])) return [];
    const at = (finger: Finger) => tips[finger] ?? { x: Number.NaN, y: Number.NaN };
    return [
      {
        id,
        url,
        tips: { 1: at(1), 2: at(2), 3: at(3), 4: at(4), 5: at(5) },
        pressed: new Set(pose.pressed as Finger[]),
        pixelsPerKey: catalog.pixelsPerKey
      }
    ];
  }
);

/** How the hands look: the drawn poses, or the 3D renders. */
export type HandStyle = "drawn" | "rendered";

/**
 * The poses a hand is fitted from: the loaded 3D renders once there is one, else the drawn ones,
 * so the hands never vanish while the 3D set loads or after it failed. The renders cover every
 * combination of pressed fingers, so they are fitted with exact pressed fingers.
 */
export function handPoseSet<T>(
  style: HandStyle,
  drawn: readonly T[],
  rendered: readonly T[]
): { readonly poses: readonly T[]; readonly exactPressed: boolean } {
  return style === "rendered" && rendered.length > 0
    ? { poses: rendered, exactPressed: true }
    : { poses: drawn, exactPressed: false };
}
