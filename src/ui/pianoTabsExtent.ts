import type { ReaderGeometry } from "../staff/readerGeometry";
import type { TabRow } from "./pianoTabsLayout";

/** Reserve scroll space for cursor overhang without changing musical row or duration widths. */
export function sharedTabsExtent(
  rows: readonly TabRow[],
  geometry: Pick<ReaderGeometry, "svgOffsetX" | "viewportWidth">,
  viewportWidth: number,
  singleLine: boolean
): { readonly width: number; readonly paddingLeft: number; readonly paddingRight: number } {
  let length = 0;
  let end = 0;
  for (const row of rows) {
    length = Math.max(length, row.width);
    for (const spot of row.cursorSpots ?? []) {
      if (Number.isFinite(spot.x)) end = Math.max(end, spot.x);
    }
  }
  end = Math.max(length, end);
  const paddingRight = singleLine
    ? Math.max(0, viewportWidth - geometry.viewportWidth / 2) + end - length
    : 0;
  const width = geometry.svgOffsetX + length + paddingRight;
  return {
    width: singleLine ? Math.ceil(width) : width,
    paddingLeft: geometry.svgOffsetX,
    paddingRight
  };
}
