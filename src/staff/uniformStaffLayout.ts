import { unitInPixels, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { uniformStaffInstructionSpace } from "./uniformStaffInstructions";
import { overlappingInkSpace, staffNoteInk, type StaffInkBox } from "./uniformStaffInk";

export interface UniformStaffAxis {
  readonly originX: number;
  readonly pixelsPerSecond: number;
  readonly timeAtBeat: (beat: number) => number;
  readonly xAtBeat?: (beat: number) => number;
  readonly breakBeats?: readonly number[];
}

/** Bounded OSMD 2.1.3 / bundled VexFlow 1.2.93 engraving contract.
 * These instance hooks run before beams, ties, expressions and absolute geometry.
 * OSMD replaces each measure's formatter every layout, so it must be reinstalled.
 */
interface TickContext {
  setX(x: number): void;
  getX(): number;
  getMetrics(): { notePx: number; extraLeftPx: number; extraRightPx: number };
}
type InkNote = Parameters<typeof staffNoteInk>[0];
interface Tickable extends InkNote {
  getTickContext(): TickContext | undefined;
  getTicks(): { value(): number };
  shouldIgnoreTicks(): boolean;
  getCategory(): string;
  preFormat(): void;
  getMetrics(): {
    noteWidth: number;
    extraLeftPx: number;
    extraRightPx: number;
    modLeftPx: number;
    modRightPx: number;
  };
  getYs(): number[];
  getStave(): { getYForLine(line: number): number; getNumLines(): number };
  hasStem?: () => boolean;
  getStemExtents?: () => { topY: number; baseY: number };
  getGlyphWidth?: () => number;
  getXShift?: () => number;
  setXShift?: (value: number) => void;
  isCenterAligned?: () => boolean;
  render_options?: { stave_padding: number };
}
interface Voice {
  getTickables(): Tickable[];
  getActualResolution(): number;
  getResolutionMultiplier(): number;
}
interface Measure {
  ParentStaff: { idInMusicSheet: number };
  staffEntries: {
    getAbsoluteTimestamp(): { RealValue: number };
    LyricsEntries: {
      GraphicalLabel: { PositionAndShape: { BorderMarginLeft: number; BorderMarginRight: number } };
    }[];
  }[];
  parentSourceMeasure: {
    AbsoluteTimestamp: { RealValue: number };
    Duration: { RealValue: number };
    multipleRestMeasures?: number;
  };
  vfVoices: Record<string, Voice>;
  minimumStaffEntriesWidth: number;
  setWidth: (this: Measure, width: number) => void;
  formatVoices: ((width: number, measure: Measure) => void) | undefined;
  getVFStave(): { getNoteStartX(): number; getX(): number };
  PositionAndShape: { AbsolutePosition: { x: number }; RelativePosition: { x: number } };
}
interface Calculator {
  calculateXLayout: (this: Calculator, ...args: unknown[]) => void;
}
interface LayoutSheet {
  MeasureList: (Measure | undefined)[][];
  GetCalculator: Calculator;
}
interface TimedTick {
  readonly beat: number;
  readonly context: TickContext;
  readonly tickables: Tickable[];
}
interface MeasureState {
  readonly row: Measure[];
  readonly startBeat: number;
  readonly endBeat: number;
  readonly ticks: TimedTick[];
}

const MIN_PIXELS_PER_SECOND = 72;
const SYMBOL_GAP = 4;
// Barline gutters are independent of the spacing between neighbouring symbols.
const BARLINE_GAP = 10;
const MIN_INSET = 10;

/** Collects all voices, including invisible ghost rests which advance their clocks. */
function timedTicks(row: readonly Measure[], startBeat: number): TimedTick[] {
  const byContext = new Map<TickContext, TimedTick>();
  for (const measure of row) {
    for (const voice of Object.values(measure.vfVoices)) {
      let beat = startBeat;
      // getActualResolution includes the integer-grid multiplier used for tuplets;
      // getTicks().value() remains the unscaled fractional duration.
      const ticksPerBeat = voice.getActualResolution() / voice.getResolutionMultiplier() / 4;
      for (const note of voice.getTickables()) {
        const context = note.getTickContext();
        if (context && !note.shouldIgnoreTicks()) {
          const tick = byContext.get(context) ?? { beat, context, tickables: [] };
          tick.tickables.push(note);
          byContext.set(context, tick);
        }
        if (!note.shouldIgnoreTicks()) beat += note.getTicks().value() / ticksPerBeat;
      }
    }
  }
  return [...byContext.values()].sort((a, b) => a.beat - b.beat);
}

/** One musical density; fixed boundary gutters do not stretch every measure. */
function density(
  states: readonly MeasureState[],
  timeAtBeat: (beat: number) => number,
  instructions: { readonly inset: number; readonly endings: ReadonlyMap<number, number> }
) {
  let pixelsPerSecond = MIN_PIXELS_PER_SECOND;
  let inset = Math.max(MIN_INSET, instructions.inset);
  interface Column {
    beat: number;
    measureStart: number;
    ink: readonly StaffInkBox[];
    labelHalf: number;
    glyphRight: number;
  }
  const columnsByStaff = new Map<number, Column[]>();
  const tails: { column: Column; endBeat: number; ending: number }[] = [];
  for (const state of states) {
    for (const measure of state.row) {
      const labels = new Map<number, number>();
      for (const entry of measure.staffEntries) {
        const width = Math.max(
          0,
          ...entry.LyricsEntries.map((lyric) => {
            const box = lyric.GraphicalLabel.PositionAndShape;
            return (box.BorderMarginRight - box.BorderMarginLeft) * unitInPixels;
          })
        );
        labels.set(entry.getAbsoluteTimestamp().RealValue * 4, width / 2);
      }
      const columns: Column[] = [];
      for (const tick of timedTicks([measure], state.startBeat)) {
        const visible = tick.tickables.filter(
          (note) => note.getCategory() === "stavenotes" && !note.isCenterAligned?.()
        );
        if (visible.length === 0) continue;
        const ink: StaffInkBox[] = [];
        let barlineLeft = 0;
        let barlineRight = 0;
        for (const note of visible) {
          note.preFormat();
          const boxes = staffNoteInk(note);
          ink.push(...boxes);
          const stave = note.getStave();
          const top = stave.getYForLine(0);
          const bottom = stave.getYForLine(stave.getNumLines() - 1);
          for (const box of boxes) {
            if (box.bottom < top || box.top > bottom) continue;
            barlineLeft = Math.max(barlineLeft, box.left);
            barlineRight = Math.max(barlineRight, box.right);
          }
        }
        const labelHalf = labels.get(tick.beat) ?? 0;
        const column = {
          beat: tick.beat,
          measureStart: state.startBeat,
          glyphRight: barlineRight,
          ink,
          labelHalf
        };
        columns.push(column);
        // Internal accidentals need neighbour space, not extra inset at every bar.
        if (Math.abs(tick.beat - state.startBeat) < 1e-8)
          inset = Math.max(inset, barlineLeft + BARLINE_GAP);
      }
      const staff = measure.ParentStaff.idInMusicSheet;
      const previous = columnsByStaff.get(staff) ?? [];
      previous.push(...columns);
      columnsByStaff.set(staff, previous);
      const last = columns.at(-1);
      if (last)
        tails.push({
          column: last,
          endBeat: state.endBeat,
          ending: instructions.endings.get(state.startBeat) ?? 0
        });
    }
  }
  // Different staves do not collide. Use real local label and glyph widths,
  // including neighbours across barlines, rather than optical formatter padding.
  for (const columns of columnsByStaff.values()) {
    const maxLeft = Math.max(
      0,
      ...columns.flatMap((column) => column.ink.map((box) => box.left)),
      ...columns.map((column) => column.labelHalf)
    );
    const maxRight = Math.max(
      0,
      ...columns.flatMap((column) => column.ink.map((box) => box.right)),
      ...columns.map((column) => column.labelHalf)
    );
    const horizon = (maxLeft + maxRight + SYMBOL_GAP) / MIN_PIXELS_PER_SECOND;
    for (let index = 1; index < columns.length; index++) {
      const next = columns[index];
      if (!next) continue;
      for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
        const previous = columns[previousIndex];
        if (!previous) continue;
        const seconds = timeAtBeat(next.beat) - timeAtBeat(previous.beat);
        if (seconds > horizon) break;
        if (seconds <= 0 || previous.measureStart !== next.measureStart) continue;
        const inkSpace = overlappingInkSpace(previous.ink, next.ink);
        const labelSpace =
          previous.labelHalf > 0 && next.labelHalf > 0 ? previous.labelHalf + next.labelHalf : 0;
        const width = Math.max(inkSpace, labelSpace);
        if (width > 0) pixelsPerSecond = Math.max(pixelsPerSecond, (width + SYMBOL_GAP) / seconds);
      }
    }
  }
  // Boundary space belongs only to the affected measure, not the song's density.
  const gutters = new Map<number, number>();
  for (const { column, endBeat, ending } of tails) {
    const seconds = timeAtBeat(endBeat) - timeAtBeat(column.beat);
    const needed = Math.max(
      0,
      inset + column.glyphRight + BARLINE_GAP + ending - seconds * pixelsPerSecond
    );
    gutters.set(column.measureStart, Math.max(gutters.get(column.measureStart) ?? 0, needed));
  }
  const starts = states.map((state) => state.startBeat);
  const indices = new Map(starts.map((beat, index) => [beat, index]));
  // A lyric can cross below a barline: cover cross-measure ink and label pairs too.
  for (const columns of columnsByStaff.values()) {
    const maxLeft = Math.max(
      0,
      ...columns.map((column) => Math.max(column.labelHalf, ...column.ink.map((box) => box.left)))
    );
    const maxRight = Math.max(
      0,
      ...columns.map((column) => Math.max(column.labelHalf, ...column.ink.map((box) => box.right)))
    );
    const horizon = (maxLeft + maxRight + SYMBOL_GAP) / pixelsPerSecond;
    for (let index = 1; index < columns.length; index++) {
      const next = columns[index];
      if (!next) continue;
      const nextIndex = indices.get(next.measureStart) ?? 0;
      const boundary = starts[nextIndex - 1];
      if (boundary === undefined) continue;
      for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
        const previous = columns[previousIndex];
        if (!previous) continue;
        const seconds = timeAtBeat(next.beat) - timeAtBeat(previous.beat);
        if (seconds > horizon) break;
        if (previous.measureStart === next.measureStart) continue;
        let distance = seconds * pixelsPerSecond;
        for (
          let measureIndex = indices.get(previous.measureStart) ?? 0;
          measureIndex < nextIndex;
          measureIndex++
        ) {
          distance += gutters.get(starts[measureIndex] ?? 0) ?? 0;
        }
        const labelSpace =
          previous.labelHalf > 0 && next.labelHalf > 0 ? previous.labelHalf + next.labelHalf : 0;
        const needed =
          Math.max(overlappingInkSpace(previous.ink, next.ink), labelSpace) + SYMBOL_GAP;
        if (needed > distance)
          gutters.set(boundary, (gutters.get(boundary) ?? 0) + needed - distance);
      }
    }
  }
  return { pixelsPerSecond, inset, gutters };
}

export interface UniformStaffLayout {
  getAxis(): UniformStaffAxis | undefined;
  dispose(): void;
}

/** Install after load and before render, only for the single horizontal staff. */
export function installUniformStaffLayout(
  osmd: OpenSheetMusicDisplay,
  timeAtBeat: (beat: number) => number
): UniformStaffLayout {
  const sheet = osmd.GraphicSheet as unknown as LayoutSheet;
  const calculator = sheet.GetCalculator;
  const original = calculator.calculateXLayout;
  const originalMaximumWidth = osmd.EngravingRules.SheetMaximumWidth;
  let restoreMeasures: (() => void)[] = [];
  const headShifts = new Map<Tickable, number>();
  const restoreHead = (note: Tickable) => {
    const shift = headShifts.get(note);
    if (shift !== undefined) {
      note.setXShift?.((note.getXShift?.() ?? 0) - shift);
      headShifts.delete(note);
    }
  };
  let axis:
    | {
        first: Measure;
        prefix: number;
        inset: number;
        scale: number;
        states: readonly MeasureState[];
        gutters: ReadonlyMap<number, number>;
      }
    | undefined;
  const reset = () => {
    for (const note of headShifts.keys()) restoreHead(note);
    for (const restore of restoreMeasures) restore();
    restoreMeasures = [];
    axis = undefined;
  };
  calculator.calculateXLayout = function (...args) {
    reset();
    original.apply(this, args);
    const states: MeasureState[] = [];
    const sourceIndex = new Map(
      osmd.Sheet.SourceMeasures.map((measure, index) => [
        measure.AbsoluteTimestamp.RealValue * 4,
        index
      ])
    );
    for (const sourceRow of sheet.MeasureList) {
      const row = sourceRow.filter((measure): measure is Measure => measure !== undefined);
      const measure = row[0];
      if (!measure) continue;
      const startBeat = measure.parentSourceMeasure.AbsoluteTimestamp.RealValue * 4;
      let endBeat = startBeat + measure.parentSourceMeasure.Duration.RealValue * 4;
      const rests = measure.parentSourceMeasure.multipleRestMeasures ?? 1;
      const firstIndex = sourceIndex.get(startBeat);
      if (rests > 1 && firstIndex !== undefined) {
        const lastRest = osmd.Sheet.SourceMeasures[firstIndex + rests - 1];
        if (lastRest)
          endBeat = (lastRest.AbsoluteTimestamp.RealValue + lastRest.Duration.RealValue) * 4;
      }
      states.push({ row, startBeat, endBeat, ticks: timedTicks(row, startBeat) });
    }
    const first = states[0]?.row[0];
    if (!first) return;
    const {
      pixelsPerSecond: scale,
      inset,
      gutters
    } = density(states, timeAtBeat, uniformStaffInstructionSpace(osmd));
    const last = states.at(-1);
    if (last) {
      // OSMD normally caps a horizontal sheet at 32767 CSS pixels and then
      // silently wraps long music. Its pageWidth was assigned before this hook.
      const duration = timeAtBeat(last.endBeat) - timeAtBeat(states[0]?.startBeat ?? 0);
      osmd.EngravingRules.SheetMaximumWidth = Math.max(
        originalMaximumWidth,
        (duration * scale + [...gutters.values()].reduce((sum, gap) => sum + gap, 0) + 2048) *
          osmd.Zoom
      );
      osmd.Sheet.pageWidth = osmd.EngravingRules.SheetMaximumWidth / osmd.Zoom / unitInPixels;
    }
    axis = { first, prefix: 0, inset, scale, states, gutters };
    for (const state of states) {
      for (const measure of state.row) {
        const setWidth = measure.setWidth;
        const formatter = measure.formatVoices;
        const duration = timeAtBeat(state.endBeat) - timeAtBeat(state.startBeat);
        const gutter = gutters.get(state.startBeat) ?? 0;
        measure.minimumStaffEntriesWidth = (duration * scale + gutter) / unitInPixels;
        measure.setWidth = function () {
          // First clef/key/time signature occupy a lead-in outside musical time.
          const prefix =
            state === states[0]
              ? Math.max(0, this.getVFStave().getNoteStartX() - this.getVFStave().getX())
              : 0;
          if (axis && this === first) axis.prefix = prefix;
          setWidth.call(this, (prefix + duration * scale + gutter) / unitInPixels);
        };
        if (formatter) {
          measure.formatVoices = function (width, target) {
            for (const tick of timedTicks(state.row, state.startBeat)) {
              for (const note of tick.tickables) restoreHead(note);
            }
            formatter.call(this, width, target);
            const prefix = state === states[0] ? (axis?.prefix ?? 0) : 0;
            // Formatter recreates TickContexts on every invocation.
            for (const tick of timedTicks(state.row, state.startBeat)) {
              const reference = tick.tickables.find((note) => note.getGlyphWidth !== undefined);
              const halfHead =
                (reference?.getGlyphWidth?.() ?? tick.context.getMetrics().notePx) / 2;
              const padding = reference?.render_options?.stave_padding ?? 12;
              tick.context.setX(
                prefix +
                  inset +
                  (timeAtBeat(tick.beat) - timeAtBeat(state.startBeat)) * scale -
                  target.getVFStave().getNoteStartX() -
                  padding -
                  halfHead
              );
              // Whole and filled heads have different widths. Their centers,
              // rather than their left edges, share the musical attack column.
              // Preserve VexFlow's legitimate voice/chord displacement.
              for (const note of tick.tickables) {
                if (!note.getGlyphWidth || note.isCenterAligned?.()) continue;
                const shift = halfHead - note.getGlyphWidth() / 2;
                if (shift !== 0 && note.setXShift && note.getXShift) {
                  note.setXShift(note.getXShift() + shift);
                  headShifts.set(note, shift);
                }
              }
            }
          };
        }
        restoreMeasures.push(() => {
          measure.setWidth = setWidth;
          measure.formatVoices = formatter;
        });
      }
    }
  };
  return {
    getAxis: () => {
      if (!axis) return undefined;
      const snapshot = axis;
      const zoom = osmd.Zoom;
      const knots = new Map<number, number>();
      for (const [index, state] of snapshot.states.entries()) {
        const measure = state.row[0];
        if (!measure) continue;
        const startX =
          measure.PositionAndShape.AbsolutePosition.x * unitInPixels +
          (index === 0 ? snapshot.prefix : 0) +
          snapshot.inset;
        for (const beat of [state.startBeat, ...state.ticks.map((tick) => tick.beat)]) {
          knots.set(
            beat,
            (startX + (timeAtBeat(beat) - timeAtBeat(state.startBeat)) * snapshot.scale) * zoom
          );
        }
        if (index === snapshot.states.length - 1) {
          knots.set(
            state.endBeat,
            (startX +
              (timeAtBeat(state.endBeat) - timeAtBeat(state.startBeat)) * snapshot.scale +
              (snapshot.gutters.get(state.startBeat) ?? 0)) *
              zoom
          );
        }
      }
      const points = [...knots].sort((a, b) => a[0] - b[0]);
      const xAtBeat = (beat: number): number => {
        const first = points[0];
        if (!first) return 0;
        if (beat <= first[0]) return first[1];
        for (let index = 1; index < points.length; index++) {
          const before = points[index - 1],
            after = points[index];
          if (!before || !after || beat > after[0]) continue;
          const duration = timeAtBeat(after[0]) - timeAtBeat(before[0]);
          const share = duration > 0 ? (timeAtBeat(beat) - timeAtBeat(before[0])) / duration : 0;
          return before[1] + (after[1] - before[1]) * share;
        }
        return points.at(-1)?.[1] ?? first[1];
      };
      return {
        originX: xAtBeat(snapshot.states[0]?.startBeat ?? 0),
        pixelsPerSecond: snapshot.scale * zoom,
        timeAtBeat,
        xAtBeat,
        breakBeats: points.map(([beat]) => beat)
      };
    },
    dispose: () => {
      reset();
      calculator.calculateXLayout = original;
      osmd.EngravingRules.SheetMaximumWidth = originalMaximumWidth;
    }
  };
}
