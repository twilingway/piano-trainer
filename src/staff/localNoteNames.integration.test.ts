// @vitest-environment happy-dom
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { GraphicalLyricEntry } from "opensheetmusicdisplay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { musicXmlWithNoteNames } from "../song/musicxml";
import { noteNameStack } from "../song/noteNameMarker";
import { installLocalNoteNames } from "./localNoteNames";

function note(step: string, octave: number, staff: number, extras = "", duration = 4) {
  const type = duration === 8 ? "half" : "quarter";
  return `<note>${extras.includes("<chord/>") ? "<chord/>" : ""}<pitch><step>${step}</step><octave>${String(octave)}</octave></pitch><duration>${String(duration)}</duration><voice>${String(staff)}</voice><type>${type}</type><staff>${String(staff)}</staff>${extras.replace("<chord/>", "")}</note>`;
}

const vocal = (text: string) =>
  `<lyric number="1"><syllabic>single</syllabic><text>${text}</text></lyric>`;
const three = (octave: number, staff: number) =>
  note("C", octave, staff) + note("C", octave, staff) + note("C", octave, staff, "", 8);
const xml = `<?xml version="1.0"?><score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      ${note("C", 4, 1, vocal("Original"))}${note("D", 4, 1, vocal("phrase"))}${note("E", 4, 1, "", 8)}
      <backup><duration>16</duration></backup>${three(3, 2)}
    </measure>
    <measure number="2">${three(2, 1)}<backup><duration>16</duration></backup>${three(1, 2)}</measure>
    <measure number="3">${three(5, 1)}<backup><duration>16</duration></backup>
      ${note("C", 3, 2)}${note("E", 3, 2, "<chord/>")}${note("G", 3, 2, "<chord/>")}${note("C", 3, 2)}${note("C", 3, 2, "", 8)}
    </measure>
  </part>
</score-partwise>`;

async function load(source: string, local: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(host, "offsetWidth", { value: 1000 });
  const osmd = new OpenSheetMusicDisplay(host, {
    backend: "svg",
    autoResize: false,
    renderSingleHorizontalStaffline: true
  });
  await osmd.load(source);
  if (local) installLocalNoteNames(osmd);
  osmd.render();
  return osmd;
}

function labels(osmd: OpenSheetMusicDisplay) {
  return osmd.GraphicSheet.MeasureList.flatMap((row) =>
    row.flatMap((measure, staff) =>
      measure.staffEntries.flatMap((entry) =>
        entry.LyricsEntries.map((lyric: GraphicalLyricEntry) => {
          const box = lyric.GraphicalLabel.PositionAndShape;
          return {
            staff,
            beat: entry.getAbsoluteTimestamp().RealValue * 4,
            text: lyric.LyricsEntry.Text,
            stack: noteNameStack(lyric.LyricsEntry.VerseNumber),
            y: box.RelativePosition.y,
            top: box.RelativePosition.y + box.BorderMarginTop,
            bottom: box.RelativePosition.y + box.BorderMarginBottom
          };
        })
      )
    )
  );
}

describe("local note names with installed OSMD", () => {
  beforeEach(() => {
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

  it("keeps local ledger-note baselines, source vocals and chord stacks stable through rerender", async () => {
    const source = await load(xml, false);
    const sourceVocals = labels(source).filter((label) => label.stack === undefined);
    const named = musicXmlWithNoteNames(xml, "en");
    const standard = await load(named, false);
    const local = await load(named, true);
    const positioned = labels(local);
    const names = positioned.filter((label) => label.stack !== undefined);
    expect(names).toHaveLength(20);
    const vocals = positioned.filter((label) => label.stack === undefined);
    expect(vocals.map((label) => label.text)).toEqual(["Original", "phrase"]);
    expect(vocals.map((label) => label.y)).toEqual(sourceVocals.map((label) => label.y));

    const first = names.find((label) => label.staff === 1 && label.beat === 0);
    const neighbor = names.find((label) => label.staff === 1 && label.beat === 1);
    const ledger = names.find((label) => label.staff === 1 && label.beat === 4);
    if (!first || !neighbor || !ledger) throw new Error("Missing test note-name labels");
    expect(neighbor.y).toBeCloseTo(first.y, 6);
    expect(ledger.y).toBeGreaterThan(first.y + 2);
    const standardFirst = labels(standard).find(
      (label) => label.staff === 1 && label.beat === 0 && label.stack !== undefined
    );
    expect(first.y).toBeLessThan(standardFirst?.y ?? 0);

    const chord = names.filter((label) => label.staff === 1 && label.beat === 8);
    expect(chord.map((label) => [label.text, label.stack])).toEqual([
      ["C", 1],
      ["E", 2],
      ["G", 3]
    ]);
    expect(chord[1]?.top ?? 0).toBeGreaterThan(chord[0]?.bottom ?? 0);
    expect(chord[2]?.top ?? 0).toBeGreaterThan(chord[1]?.bottom ?? 0);
    for (const voice of vocals) {
      const name = names.find((label) => label.staff === voice.staff && label.beat === voice.beat);
      expect(name?.top ?? 0).toBeGreaterThanOrEqual(voice.bottom);
    }

    local.render();
    expect(labels(local)).toEqual(positioned);
  });
});
