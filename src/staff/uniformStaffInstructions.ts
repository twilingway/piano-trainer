import {
  ClefInstruction,
  KeyInstruction,
  RhythmInstruction,
  VexFlowMeasure,
  unitInPixels,
  type OpenSheetMusicDisplay
} from "opensheetmusicdisplay";

/** Measure instruction glyphs with the installed engraver on unattached staves.
 * No note, original stave or source instruction is edited. This preflight is
 * necessary because MusicSystemBuilder creates real signature modifiers later.
 */
export function uniformStaffInstructionSpace(osmd: OpenSheetMusicDisplay) {
  const clefs = new Map<number, ClefInstruction>();
  const keys = new Map<number, KeyInstruction>();
  let inset = 0;
  let ending = 0;
  const endings = new Map<number, number>();
  for (let rowIndex = 0; rowIndex < osmd.GraphicSheet.MeasureList.length; rowIndex++) {
    const row = osmd.GraphicSheet.MeasureList[rowIndex] ?? [];
    for (const measure of row) {
      // Sparse rows represent staves or source measures hidden by OSMD.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      const staffId = measure.ParentStaff.idInMusicSheet;
      const source = measure.parentSourceMeasure;
      const instructions = source.FirstInstructionsStaffEntries[staffId]?.Instructions ?? [];
      const newClef = instructions.find(
        (instruction): instruction is ClefInstruction => instruction instanceof ClefInstruction
      );
      const newKey = instructions.find(
        (instruction): instruction is KeyInstruction => instruction instanceof KeyInstruction
      );
      const clef = newClef ?? clefs.get(staffId);
      const scratch = new VexFlowMeasure(
        measure.ParentStaff,
        Object.create(source) as typeof source
      );
      if (newClef) scratch.addClefAtBegin(newClef);
      if (newKey && clef)
        scratch.addKeyAtBegin(newKey, keys.get(staffId) ?? new KeyInstruction(), clef);
      for (const instruction of instructions) {
        if (instruction instanceof RhythmInstruction && instruction.PrintObject) {
          scratch.addRhythmAtBegin(instruction);
        }
      }
      if (rowIndex > 0 && instructions.length > 0) {
        // Stave padding, half a wide head, and readable air after signatures.
        inset = Math.max(inset, scratch.getVFStave().getNoteStartX() + 32);
      }
      const lastInstructions = source.LastInstructionsStaffEntries[staffId]?.Instructions ?? [];
      for (const instruction of lastInstructions) {
        if (instruction instanceof ClefInstruction) {
          scratch.addClefAtEnd(instruction);
          clefs.set(staffId, instruction);
          ending = Math.max(ending, scratch.endInstructionsWidth * unitInPixels + 10);
          const beat = source.AbsoluteTimestamp.RealValue * 4;
          endings.set(
            beat,
            Math.max(endings.get(beat) ?? 0, scratch.endInstructionsWidth * unitInPixels + 10)
          );
        }
      }
      if (clef && !lastInstructions.some((instruction) => instruction instanceof ClefInstruction))
        clefs.set(staffId, clef);
      if (newKey) keys.set(staffId, newKey);
    }
  }
  return { inset, ending, endings };
}
