import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface MeasureWidth {
  readonly width: number;
  readonly startsLine: boolean;
}

/** XML line breaks are maximums in OSMD: natural width breaks can occur before them. */
export function wrappedStaffScale(
  measures: readonly MeasureWidth[],
  pageWidth: number,
  pageMargins: number
): number {
  let widest = 0;
  let width = 0;
  for (const measure of measures) {
    if (measure.startsLine) {
      widest = Math.max(widest, width);
      width = 0;
    }
    width += measure.width;
  }
  const required = Math.max(widest, width) + pageMargins;
  if (pageWidth <= 0 || required <= pageWidth + 1e-6) return 1;
  // A little air avoids another natural break from rounding and regenerated clefs.
  return (pageWidth / required) * 0.98;
}

/** Fit each requested XML system, without changing the player's saved zoom. */
export function fitWrappedStaff(osmd: OpenSheetMusicDisplay): void {
  // Repeated layout can regenerate instruction widths; keep the correction bounded.
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = osmd.GraphicSheet.MusicPages[0];
    if (!page) return;
    const measures = osmd.GraphicSheet.MeasureList.map((staves) => {
      // OSMD's declaration omits the empty slots left by hidden/missing staves.
      const visible = staves.filter(Boolean);
      return {
        width: Math.max(0, ...visible.map((staff) => staff.PositionAndShape.Size.width)),
        startsLine: visible[0]?.parentSourceMeasure.printNewSystemXml ?? false
      };
    });
    const rules = osmd.EngravingRules;
    const scale = wrappedStaffScale(
      measures,
      page.PositionAndShape.Size.width,
      rules.PageLeftMargin + rules.PageRightMargin
    );
    if (scale === 1) return;
    osmd.Zoom *= scale;
    osmd.render();
  }
}
