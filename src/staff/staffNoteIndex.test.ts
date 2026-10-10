// @vitest-environment happy-dom
import { VexFlowGraphicalNote, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";

import { spotAt } from "./liveCursor";
import { beatPositions, indexNotes } from "./staffNoteIndex";

function drawnNote(beat: number, rest: boolean, left: number) {
  const note = Object.create(VexFlowGraphicalNote.prototype) as VexFlowGraphicalNote;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.append(head);
  group.getBoundingClientRect = () => new DOMRect(left, 20, 80, 40);
  head.getBoundingClientRect = () => new DOMRect(left, 20, 10, 10);
  note.getSVGGElement = () => group;
  note.getNoteheadSVGs = () => (rest ? [] : [head as unknown as HTMLElement]);
  Object.defineProperty(note, "sourceNote", { value: { isRest: () => rest, halfTone: 48 } });
  return {
    note,
    group,
    head,
    entry: {
      getAbsoluteTimestamp: () => ({ RealValue: beat / 4 }),
      graphicalVoiceEntries: [{ notes: [note] }]
    }
  };
}

describe("staff cursor entry index", () => {
  it("includes the opening rest in cursor timing without turning it into a playable note", () => {
    const rest = drawnNote(0, true, 100);
    const played = drawnNote(3, false, 250);
    const osmd = {
      GraphicSheet: { MeasureList: [[{ staffEntries: [rest.entry, played.entry] }]] }
    } as unknown as OpenSheetMusicDisplay;
    const index = indexNotes(osmd);
    expect(index.beats.has(rest.group)).toBe(false);
    expect([...index.beats.values()]).toEqual([3]);
    expect(index.heads.size).toBe(1);
    expect(index.cursorBeats.get(rest.group)).toBe(0);
    expect(index.cursorBeats.get(played.head)).toBe(3);
    const host = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 120);
    host.append(svg);
    const positions = beatPositions(index.cursorBeats, host, [{ top: 0, bottom: 120 }]);
    // Opening rest centre, then the notehead centre rather than its wide beamed group.
    expect(positions).toEqual([
      { beat: 0, x: 140, line: 0 },
      { beat: 3, x: 255, line: 0 }
    ]);
    expect(spotAt(positions, 0)?.x).toBe(140);
    expect(spotAt(positions, 1.5)?.x).toBe(197.5);
  });
});
