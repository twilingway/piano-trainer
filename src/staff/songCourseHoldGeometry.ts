import type { SceneRect } from "../ui/songCourseStartGeometry";
export interface HoldPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly compact: boolean;
}
interface HoldAnchor {
  readonly below?: number;
  readonly anchorX?: number;
  readonly forceFallback?: boolean;
}
const intersects = (a: SceneRect, b: SceneRect) =>
  a.left < b.right + 6 && a.right > b.left - 6 && a.top < b.bottom + 6 && a.bottom > b.top - 6;
/** A live hold always keeps its real progress: dense/occluded heads use the visible band below ink. */
export function songCourseHoldPlacement(
  view: SceneRect,
  head: SceneRect,
  obstacles: readonly SceneRect[],
  anchor: HoldAnchor = {}
): HoldPlacement | null {
  if (
    view.right - view.left < 64 ||
    view.bottom - view.top < 30 ||
    head.right <= head.left ||
    head.bottom <= head.top
  )
    return null;
  const left = head.right + 8;
  const top = Math.max(view.top + 2, head.top - 8);
  const next = obstacles
    .filter((box) => box.left >= left && box.top < top + 30 && box.bottom > top - 6)
    .map((box) => box.left - 8);
  const width = Math.min(104, view.right - 8 - left, ...next.map((x) => x - left));
  const normal = { left, top, right: left + width, bottom: top + 30 };
  if (
    !anchor.forceFallback &&
    head.left >= view.left &&
    width >= 48 &&
    normal.bottom <= view.bottom &&
    !obstacles.some((box) => intersects(normal, box))
  )
    return { left, top, width, compact: false };
  const visible = obstacles.filter((box) => box.right > view.left && box.left < view.right);
  const below =
    Math.max(head.bottom, anchor.below ?? head.bottom, ...visible.map((box) => box.bottom)) + 8;
  const compactWidth = Math.min(64, view.right - view.left - 16);
  const compactLeft = Math.max(
    view.left + 8,
    Math.min(anchor.anchorX ?? left, view.right - compactWidth - 8)
  );
  return {
    left: compactLeft,
    top: Math.max(view.top, Math.min(view.bottom - 30, below)),
    width: compactWidth,
    compact: true
  };
}
