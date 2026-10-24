// @vitest-environment happy-dom
import {
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
  unitInPixels,
  type VexFlowMeasure
} from "opensheetmusicdisplay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installUniformStaffLayout, type UniformStaffAxis } from "./uniformStaffLayout";
import { staffNoteInk } from "./uniformStaffInk";
import { EXERCISES } from "../song/exercises";

function axisX(axis: UniformStaffAxis, beat: number) {
  return axis.xAtBeat?.(beat) ?? axis.originX + axis.pixelsPerSecond * axis.timeAtBeat(beat);
}

function note(step: string, duration: number, type = "quarter", extras = "") {
  return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${String(duration)}</duration><type>${type}</type>${extras}</note>`;
}
const attributes = `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
const fullRest = `<note><rest measure="yes"/><duration>16</duration></note>`;
function score(measures: readonly string[]) {
  return `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.map((body, index) => `<measure number="${String(index + 1)}">${index === 0 ? attributes : ""}${body}</measure>`).join("")}</part></score-partwise>`;
}
const regular = score([
  note("C", 4) + note("D", 4) + note("E", 8, "half"),
  note("F", 4) + note("G", 4) + note("A", 4) + note("B", 4),
  fullRest,
  note("G", 16, "whole")
]);

async function load(xml: string) {
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(host, "offsetWidth", { value: 1000 });
  const osmd = new OpenSheetMusicDisplay(host, {
    backend: "svg",
    autoResize: false,
    renderSingleHorizontalStaffline: true
  });
  await osmd.load(xml);
  return osmd;
}

interface DrawnNote {
  getNoteHeadBeginX(): number;
  getGlyphWidth(): number;
}
/** The exact coordinates passed by the actual VexFlow drawer to SVG glyphs. */
function heads(osmd: OpenSheetMusicDisplay) {
  return osmd.GraphicSheet.MeasureList.flatMap((row) =>
    row
      // OSMD leaves runtime holes when it combines consecutive empty measures.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      .filter((measure) => measure !== undefined)
      .flatMap((measure) =>
        measure.staffEntries.flatMap((entry) =>
          entry.graphicalVoiceEntries.flatMap((voice) => {
            const note = voice.notes.find((candidate) => !candidate.sourceNote.isRest());
            if (!(note instanceof VexFlowGraphicalNote)) return [];
            const drawn = (note as unknown as { vfnote: [DrawnNote] }).vfnote[0];
            return [
              {
                beat: entry.getAbsoluteTimestamp().RealValue * 4,
                x: (drawn.getNoteHeadBeginX() + drawn.getGlyphWidth() / 2) * osmd.Zoom
              }
            ];
          })
        )
      )
  );
}

describe("uniform staff layout with installed OSMD", () => {
  beforeEach(() => {
    // OSMD's text measurer needs only this canvas operation for SVG engraving.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          measureText: (text: string) => ({ width: text.length * 7 })
        }) as unknown as GPUCanvasContext
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("aligns actual notehead centers, sparse and dense measures to one time scale", async () => {
    const osmd = await load(regular);
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    expect(layout.getAxis()).toBeUndefined();
    osmd.render();
    const axis = layout.getAxis();
    expect(axis).toBeDefined();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
    const widths = osmd.GraphicSheet.MeasureList.slice(1).map(
      (row) => row[0]?.PositionAndShape.Size.width
    );
    // Only the filled bar needs a small fixed gutter; its musical scale is unchanged.
    expect(widths[0]).toBeGreaterThanOrEqual(widths[1] ?? 0);
    expect(((widths[0] ?? 0) - (widths[1] ?? 0)) * unitInPixels).toBeLessThan(10);
    expect(widths[1]).toBeCloseTo(widths[2] ?? 0, 6);
    // The first bar also reserves a clef/key/time-signature lead-in.
    expect(osmd.GraphicSheet.MeasureList[0]?.[0]?.PositionAndShape.Size.width).toBeGreaterThan(
      widths[0] ?? 0
    );
  });

  it("uses seconds through tempo changes, including changes between noteheads", async () => {
    const osmd = await load(regular);
    const timeAtBeat = (beat: number) => (beat <= 1.5 ? beat / 2 : 0.75 + (beat - 1.5));
    const layout = installUniformStaffLayout(osmd, timeAtBeat);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
    const drawn = heads(osmd);
    expect((drawn[2]?.x ?? 0) - (drawn[1]?.x ?? 0)).toBeCloseTo(axis.pixelsPerSecond * 0.75, 6);
  });

  it("reinstalls formatters and reads the current zoom on repeated renders", async () => {
    const osmd = await load(regular);
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const original = heads(osmd);
    const firstAxis = layout.getAxis();
    osmd.render();
    expect(heads(osmd)).toEqual(original);
    osmd.Zoom = 0.7;
    osmd.render();
    const axis = layout.getAxis();
    if (!axis || !firstAxis) throw new Error("No axis after render");
    expect(axis.pixelsPerSecond).toBeCloseTo(firstAxis.pixelsPerSecond * 0.7, 6);
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
    layout.dispose();
    expect(layout.getAxis()).toBeUndefined();
    osmd.render();
    expect(heads(osmd)).not.toEqual(original);
  });

  it("preserves notes, tied voices and ghost-rest timing", async () => {
    const osmd = await load(
      score([
        note("C", 4, "quarter", "<voice>1</voice>") +
          note("D", 2, "eighth", '<voice>1</voice><beam number="1">begin</beam>') +
          note("E", 2, "eighth", '<voice>1</voice><beam number="1">end</beam>') +
          note(
            "F",
            8,
            "half",
            '<voice>1</voice><tie type="start"/><notations><tied type="start"/></notations>'
          ) +
          "<backup><duration>16</duration></backup><forward><duration>8</duration><voice>2</voice></forward>" +
          note("A", 8, "half", "<voice>2</voice>"),
        note("F", 4, "quarter", '<tie type="stop"/><notations><tied type="stop"/></notations>') +
          note("G", 4) +
          note("A", 8, "half")
      ])
    );
    const source = osmd.Sheet.SourceMeasures.map((measure) => measure.AbsoluteTimestamp.RealValue);
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(Math.abs(head.x - axisX(axis, head.beat))).toBeLessThan(2);
    }
    expect(osmd.Sheet.SourceMeasures.map((measure) => measure.AbsoluteTimestamp.RealValue)).toEqual(
      source
    );
    expect(heads(osmd).map((head) => head.beat)).toContain(1.5);
  });

  it("keeps simultaneous heads across both piano staves on their attack column", async () => {
    const pianoAttributes = attributes
      .replace("<clef>", "<staves>2</staves><clef>")
      .replace(
        "</attributes>",
        '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
      );
    const content =
      note("C", 4, "quarter", "<voice>1</voice><staff>1</staff>") +
      note("D", 4, "quarter", "<voice>1</voice><staff>1</staff>") +
      note("E", 8, "half", "<voice>1</voice><staff>1</staff>") +
      "<backup><duration>16</duration></backup>" +
      note("C", 16, "whole", "<voice>2</voice><staff>2</staff>");
    const osmd = await load(score([content, content]).replace(attributes, pianoAttributes));
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(Math.abs(head.x - axisX(axis, head.beat))).toBeLessThan(2);
    }
  });

  it("retains fractional triplet timing rather than applying the integer tick-grid multiplier", async () => {
    const triplet =
      "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
    const xml = score([
      note("C", 2, "eighth", triplet) +
        note("D", 2, "eighth", triplet) +
        note("E", 2, "eighth", triplet) +
        note("G", 18, "half", "<dot/>")
    ]).replace("<divisions>4</divisions>", "<divisions>6</divisions>");
    const osmd = await load(xml);
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
  });

  it("keeps a long piece on one system beyond OSMD's default 32767px sheet cap", async () => {
    const dense = Array.from({ length: 64 }, () => note("C", 1, "64th")).join("");
    const rest = fullRest.replace("<duration>16</duration>", "<duration>64</duration>");
    const xml = score([
      dense,
      ...Array.from({ length: 77 }, (_, index) => (index % 2 === 0 ? rest : note("G", 64, "whole")))
    ]).replace("<divisions>4</divisions>", "<divisions>16</divisions>");
    const osmd = await load(xml);
    const previousMaximum = osmd.EngravingRules.SheetMaximumWidth;
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    expect(osmd.GraphicSheet.MusicPages.flatMap((page) => page.MusicSystems)).toHaveLength(1);
    expect(osmd.EngravingRules.SheetMaximumWidth).toBeGreaterThan(previousMaximum);
    const widths = osmd.GraphicSheet.MeasureList.slice(1).map(
      (row) => row[0]?.PositionAndShape.Size.width
    );
    for (const width of widths) expect(width).toBeCloseTo(widths[0] ?? 0, 6);
    osmd.render();
    expect(osmd.GraphicSheet.MusicPages.flatMap((page) => page.MusicSystems)).toHaveLength(1);
    layout.dispose();
    expect(osmd.EngravingRules.SheetMaximumWidth).toBe(previousMaximum);
  });

  it("keeps all elapsed time when OSMD combines consecutive empty measures", async () => {
    const osmd = await load(
      score([note("C", 16, "whole"), fullRest, fullRest, fullRest, note("G", 16, "whole")])
    );
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
  });

  it("reserves later key/time signatures and trailing clefs outside the noteheads", async () => {
    const quarters = note("C", 4) + note("D", 4) + note("E", 4) + note("F", 4);
    const change =
      "<attributes><key><fifths>7</fifths></key><time><beats>2</beats><beat-type>2</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>";
    const osmd = await load(score([quarters, change + quarters]));
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
    interface Modifier {
      getX(): number;
      getWidth(): number;
    }
    interface Stave {
      getModifiers(position: number): Modifier[];
    }
    const first = osmd.GraphicSheet.MeasureList[0]?.[0];
    const second = osmd.GraphicSheet.MeasureList[1]?.[0];
    if (!first || !second) throw new Error("Missing test measures");
    const beginning = ((second as VexFlowMeasure).getVFStave() as unknown as Stave).getModifiers(5);
    const signatureEnd = Math.max(
      ...beginning.map((modifier) => modifier.getX() + modifier.getWidth())
    );
    const firstHead = heads(osmd).find((head) => head.beat === 4);
    expect((firstHead?.x ?? 0) - 10).toBeGreaterThan(signatureEnd);
    const ending = ((first as VexFlowMeasure).getVFStave() as unknown as Stave).getModifiers(6);
    const lastHead = heads(osmd).find((head) => head.beat === 3);
    for (const modifier of ending) expect((lastHead?.x ?? 0) + 10).toBeLessThan(modifier.getX());
  });

  it("keeps alternating piano staves compact instead of spacing their vertical separation horizontally", async () => {
    const pianoAttributes = attributes
      .replace("<clef>", '<staves>2</staves><clef number="1">')
      .replace(
        "</attributes>",
        '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
      );
    const lyric = '<lyric number="note-name-1"><text>Mi</text></lyric>';
    const right = Array.from({ length: 8 }, () =>
      note("C", 4, "eighth", "<voice>1</voice><staff>1</staff>" + lyric)
    ).join("");
    const left =
      "<backup><duration>32</duration></backup><forward><duration>1</duration><voice>2</voice><staff>2</staff></forward>" +
      Array.from({ length: 7 }, () =>
        note("G", 4, "eighth", "<voice>2</voice><staff>2</staff>" + lyric)
      ).join("") +
      note("G", 3, "16th", "<dot/><voice>2</voice><staff>2</staff>" + lyric);
    const xml = score([right + left, right + left])
      .replace(attributes, pianoAttributes)
      .replace("<divisions>4</divisions>", "<divisions>8</divisions>");
    const osmd = await load(xml);
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    expect(axis.pixelsPerSecond).toBeLessThan(200);
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
  });

  it("does not reserve a high chord's accidental width beside a low ledger-note tail", async () => {
    const highChord = ["E", "C", "D", "F"]
      .map(
        (step, index) =>
          `<note>${index === 0 ? "" : "<chord/>"}<pitch><step>${step}</step><alter>1</alter><octave>${index === 0 ? "6" : "7"}</octave></pitch><duration>1</duration><type>16th</type><accidental>sharp</accidental></note>`
      )
      .join("");
    const rest = "<note><rest/><duration>14</duration><type>half</type><dot/><dot/></note>";
    const tail = note("C", 1, "16th").replace("<octave>4</octave>", "<octave>2</octave>");
    const osmd = await load(score([highChord + rest + tail, highChord + rest + tail]));
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    expect(axis.pixelsPerSecond).toBeLessThan(250);
    for (const head of heads(osmd)) {
      expect(Math.abs(head.x - axisX(axis, head.beat))).toBeLessThan(2);
    }
  });

  it("narrows ordinary quarter-note bars and slows their visual axis without changing score time", async () => {
    const quarters = note("C", 4) + note("D", 4) + note("E", 4) + note("F", 4);
    const osmd = await load(score([quarters, quarters]));
    const sourceTimes = osmd.Sheet.SourceMeasures.map((measure) => ({
      start: measure.AbsoluteTimestamp.RealValue,
      duration: measure.Duration.RealValue
    }));
    const timeAtBeat = (beat: number) => beat / 2;
    const layout = installUniformStaffLayout(osmd, timeAtBeat);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    expect(axis.pixelsPerSecond).toBeCloseTo(72 * osmd.Zoom, 6);
    const second = osmd.GraphicSheet.MeasureList[1]?.[0];
    if (!second) throw new Error("No second measure");
    // Two seconds at the previous 90px/s baseline occupied 180px.
    expect(second.PositionAndShape.Size.width * unitInPixels).toBeCloseTo(144, 6);
    expect(second.PositionAndShape.Size.width * unitInPixels).toBeLessThan(180);
    expect(axis.timeAtBeat).toBe(timeAtBeat);
    expect(
      osmd.Sheet.SourceMeasures.map((measure) => ({
        start: measure.AbsoluteTimestamp.RealValue,
        duration: measure.Duration.RealValue
      }))
    ).toEqual(sourceTimes);
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
  });

  it("keeps real head, accidental and short-tail ink away from both barlines", async () => {
    const sharp = (step: string) =>
      note(step, 1, "16th", "<accidental>sharp</accidental>").replace(
        "</step>",
        "</step><alter>1</alter>"
      );
    const rest = "<note><rest/><duration>14</duration><type>half</type><dot/><dot/></note>";
    const osmd = await load(
      score([sharp("C") + rest + sharp("D"), sharp("C") + rest + sharp("D")])
    );
    const timeAtBeat = (beat: number) => beat / 2;
    const layout = installUniformStaffLayout(osmd, timeAtBeat);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No axis after render");
    // Dense accidental/rest neighbours may still require more than the baseline.
    expect(axis.pixelsPerSecond).toBeGreaterThanOrEqual(72 * osmd.Zoom);
    let accidentals = 0;
    for (const row of osmd.GraphicSheet.MeasureList) {
      for (const measure of row) {
        const stave = (measure as VexFlowMeasure).getVFStave() as unknown as {
          getX(): number;
          getWidth(): number;
          getYForLine(line: number): number;
          getNumLines(): number;
        };
        const left = stave.getX();
        const right = left + stave.getWidth();
        const top = stave.getYForLine(0);
        const bottom = stave.getYForLine(stave.getNumLines() - 1);
        for (const entry of measure.staffEntries) {
          for (const voice of entry.graphicalVoiceEntries) {
            const note = voice.notes.find((candidate) => !candidate.sourceNote.isRest());
            if (!(note instanceof VexFlowGraphicalNote)) continue;
            const drawn = (note as unknown as { vfnote: [Parameters<typeof staffNoteInk>[0]] })
              .vfnote[0];
            const center =
              drawn.getNoteHeadBeginX() +
              (drawn.getGlyphWidth?.() ?? 0) / 2 -
              (drawn.getXShift?.() ?? 0);
            accidentals += drawn
              .getModifiers()
              .filter((modifier) => modifier.getCategory() === "accidentals").length;
            for (const ink of staffNoteInk(drawn)) {
              if (ink.bottom < top || ink.top > bottom) continue;
              expect(center - ink.left - left).toBeGreaterThanOrEqual(10 - 1e-6);
              expect(right - center - ink.right).toBeGreaterThanOrEqual(10 - 1e-6);
            }
          }
        }
      }
    }
    expect(accidentals).toBeGreaterThanOrEqual(4);
    for (const head of heads(osmd)) {
      expect(head.x).toBeCloseTo(axisX(axis, head.beat), 6);
    }
  });
  it("visibly compacts the actual anthem without propagating one short tail through every bar", async () => {
    const levels = EXERCISES.find((item) => item.id === "anthem-ru")?.levels ?? [];
    expect(levels).toHaveLength(3);
    for (const level of levels) {
      const timeAtBeat = (beat: number) => (beat * 60) / 76;
      const osmd = await load(level.musicXml);
      const sourceTimes = osmd.Sheet.SourceMeasures.map(
        (measure) => measure.AbsoluteTimestamp.RealValue
      );
      const layout = installUniformStaffLayout(osmd, timeAtBeat);
      osmd.render();
      const axis = layout.getAxis();
      if (!axis) throw new Error("No anthem axis after render");
      const width = osmd.GraphicSheet.MeasureList.reduce(
        (sum, row) => sum + (row[0]?.PositionAndShape.Size.width ?? 0) * unitInPixels,
        0
      );
      // Measured before the gutter fix on the same installed engraver and bundled source.
      const previousWidth = level.id === "hard" ? 16784.65 : 11163.19;
      expect(width).toBeLessThan(previousWidth * 0.85);
      expect(axis.pixelsPerSecond).toBeLessThan(166);
      for (const head of heads(osmd)) {
        expect(Math.abs(head.x - axisX(axis, head.beat))).toBeLessThan(2);
      }
      for (const measure of osmd.Sheet.SourceMeasures.slice(1)) {
        const beat = measure.AbsoluteTimestamp.RealValue * 4;
        expect(Math.abs(axisX(axis, beat - 1e-7) - axisX(axis, beat))).toBeLessThan(0.001);
      }
      expect(
        osmd.Sheet.SourceMeasures.map((measure) => measure.AbsoluteTimestamp.RealValue)
      ).toEqual(sourceTimes);
    }
  });

  it("reserves cross-bar lyric ink as a local gutter rather than a global density increase", async () => {
    const lyric = "<lyric><text>Twenty-character-label</text></lyric>";
    const osmd = await load(
      score([
        note("C", 12, "half", "<dot/>") + note("D", 4, "quarter", lyric),
        note("E", 4, "quarter", lyric) + note("F", 12, "half", "<dot/>")
      ])
    );
    const layout = installUniformStaffLayout(osmd, (beat) => beat / 2);
    osmd.render();
    const axis = layout.getAxis();
    if (!axis) throw new Error("No lyric axis after render");
    expect(axis.pixelsPerSecond).toBe(72);
    const entries = osmd.GraphicSheet.MeasureList.flatMap((row) =>
      row.flatMap((measure) => measure.staffEntries)
    );
    const halves = entries.flatMap((entry) =>
      entry.LyricsEntries.map((lyricEntry) => {
        const box = lyricEntry.GraphicalLabel.PositionAndShape;
        return ((box.BorderMarginRight - box.BorderMarginLeft) * unitInPixels) / 2;
      })
    );
    expect(halves).toHaveLength(2);
    expect(axisX(axis, 4) - axisX(axis, 3)).toBeGreaterThanOrEqual(
      (halves[0] ?? 0) + (halves[1] ?? 0) + 4 - 1e-6
    );
    expect(Math.abs(axisX(axis, 4 - 1e-7) - axisX(axis, 4))).toBeLessThan(0.001);
  });
});
