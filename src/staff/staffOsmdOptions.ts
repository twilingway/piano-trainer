import type { IOSMDOptions } from "opensheetmusicdisplay";

/** The existing staff engraving setup, shared by its drawing and course reach measurement. */
export function createStaffOsmdOptions(
  host: HTMLElement,
  {
    fingers,
    singleLine,
    breaksFromScore
  }: {
    readonly fingers: boolean;
    readonly singleLine: boolean;
    readonly breaksFromScore: boolean;
  }
): IOSMDOptions {
  return {
    backend: "svg",
    defaultColorMusic: getComputedStyle(host).getPropertyValue("--accent").trim(),
    // Re-flowing on resize is done by Staff, so line sizes are measured again too.
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
    drawPartNames: false,
    // OSMD leaves these off for a one-part score; the reader chooses.
    drawFingerings: fingers,
    renderSingleHorizontalStaffline: singleLine,
    followCursor: false,
    newSystemFromXML: breaksFromScore,
    // Eighths and shorter are beamed beat by beat, so each beat reads as one group at a glance.
    autoBeam: true,
    autoBeamOptions: { groups: [[1, 4]] }
  };
}
