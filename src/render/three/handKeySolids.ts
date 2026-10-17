import { WHITE_W, whitePosition, isBlack } from "./handSolver/mech";
import type { Vec3, KeyTarget } from "./handSolver/mech";
interface KeyBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly top: number;
}
const BLACK_HALF = WHITE_W * 0.3,
  BLACK_FRONT = 55.8;
const keyBoxes = new Map<number, readonly KeyBox[]>();
for (let pitch = 21; pitch <= 108; pitch++) {
  const x = whitePosition(pitch) * WHITE_W;
  keyBoxes.set(
    pitch,
    isBlack(pitch)
      ? [{ x0: x - BLACK_HALF, x1: x + BLACK_HALF, y0: BLACK_FRONT, y1: 150, top: 12 }]
      : [
          { x0: x - WHITE_W / 2, x1: x + WHITE_W / 2, y0: 0, y1: BLACK_FRONT, top: 0 },
          {
            x0: x - (isBlack(pitch - 1) ? WHITE_W / 2 - BLACK_HALF : WHITE_W / 2),
            x1: x + (isBlack(pitch + 1) ? WHITE_W / 2 - BLACK_HALF : WHITE_W / 2),
            y0: BLACK_FRONT,
            y1: 150,
            top: 0
          }
        ]
  );
}

const outlines = new Map<number, readonly (readonly [number, number])[]>();
for (const [pitch, boxes] of keyBoxes) {
  const front = boxes[0],
    back = boxes[1];
  if (!front || !back) continue;
  outlines.set(pitch, [
    [front.x0, 0],
    [front.x1, 0],
    [front.x1, BLACK_FRONT],
    [back.x1, BLACK_FRONT],
    [back.x1, 150],
    [back.x0, 150],
    [back.x0, BLACK_FRONT],
    [front.x0, BLACK_FRONT]
  ]);
}

/** Signed distance to a key's upper solid. Continuous lateral gradients keep pads on their own key. */
function boxDistance(p: Vec3, box: KeyBox): number {
  const dx = Math.max(box.x0 - p[0], 0, p[0] - box.x1),
    dy = Math.max(box.y0 - p[1], 0, p[1] - box.y1),
    dz = Math.max(p[2] - box.top, 0);
  if (dx > 0 || dy > 0 || dz > 0) return Math.hypot(dx, dy, dz);
  return -Math.min(p[0] - box.x0, box.x1 - p[0], p[1] - box.y0, box.y1 - p[1], box.top - p[2]);
}

export function keyDistance(pitch: number, point: Vec3): number {
  const boxes = keyBoxes.get(pitch);
  let distance = Infinity;
  for (const box of boxes ?? []) distance = Math.min(distance, boxDistance(point, box));
  const outline = distance <= 0 ? outlines.get(pitch) : undefined;
  if (outline) {
    // The shared rectangle edge is inside the white key, not an escape surface.
    let boundary2 = Math.max(0, -point[2]) ** 2;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      if (!a || !b) continue;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = dx * dx + dy * dy;
      const t = length
        ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length))
        : 0;
      boundary2 = Math.min(
        boundary2,
        (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dy) ** 2
      );
    }
    return -Math.sqrt(boundary2);
  }
  return distance;
}

/** Fast narrow-band point penetration; measured skin points have no extra sphere radius. */
export function keyPenetration(pitch: number, p: Vec3, margin: number): number {
  let penetration = 0;
  for (const box of keyBoxes.get(pitch) ?? []) {
    if (
      p[0] < box.x0 - margin ||
      p[0] > box.x1 + margin ||
      p[1] < box.y0 - margin ||
      p[1] > box.y1 + margin ||
      p[2] > box.top + margin
    )
      continue;
    penetration = Math.max(penetration, margin - boxDistance(p, box));
  }
  return penetration > 0 ? Math.max(0, margin - keyDistance(pitch, p)) : 0;
}

/** Flat playing patches stay clear of the sculpted black cap's sloping front and tapered sides. */
export const CONTACT_PATCH_X = { white: 9, black: 3 } as const;
export const CONTACT_PATCH_Y = { white: [3, 50], black: [85, 140] } as const;
export function inContactPatch(
  target: Pick<KeyTarget, "black" | "x">,
  x: number,
  y: number
): boolean {
  const side = target.black ? "black" : "white",
    range = CONTACT_PATCH_Y[side];
  return Math.abs(x - target.x) <= CONTACT_PATCH_X[side] && y >= range[0] && y <= range[1];
}
