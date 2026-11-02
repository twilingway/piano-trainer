// @vitest-environment happy-dom
import { VexFlowGraphicalNote, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonStaffFeedbackOverlay } from "./lessonStaffFeedbackOverlay";
import { feedbackNotehead, indexNotes, markKey } from "./staffNoteIndex";

function headAt(y: number): SVGGElement {
  const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
  head.classList.add("vf-notehead");
  head.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
  head.getBoundingClientRect = () => new DOMRect(60, y, 10, 8);
  return head;
}
function graphicalNote(
  pitch: number,
  index: number,
  group: SVGGElement,
  sharedHeads: readonly SVGGElement[],
  chord: Parameters<VexFlowGraphicalNote["setIndex"]>[0]
): VexFlowGraphicalNote {
  const note = Object.create(VexFlowGraphicalNote.prototype) as VexFlowGraphicalNote;
  // Exercise OSMD's actual public setIndex implementation, including its vfnote tuple.
  note.setIndex(chord, index);
  note.getSVGGElement = () => group;
  // OSMD returns the entire VF chord for every GraphicalNote, not just this pitch's head.
  note.getNoteheadSVGs = () => [...sharedHeads] as unknown as HTMLElement[];
  Object.defineProperty(note, "sourceNote", {
    value: { isRest: () => false, halfTone: pitch - 12 }
  });
  return note;
}
function score(voices: readonly (readonly VexFlowGraphicalNote[])[]): OpenSheetMusicDisplay {
  return {
    GraphicSheet: {
      MeasureList: [
        [
          {
            staffEntries: [
              {
                getAbsoluteTimestamp: () => ({ RealValue: 0 }),
                graphicalVoiceEntries: voices.map((notes) => ({ notes }))
              }
            ]
          }
        ]
      ]
    }
  } as unknown as OpenSheetMusicDisplay;
}
function stage() {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => new DOMRect(0, 0, 300, 180);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.append(svg);
  document.body.append(host);
  return { host, svg };
}
function accept(owner: LessonStaffFeedbackOverlay, pitches: readonly number[]) {
  owner.ready("presentation");
  owner.receive({
    type: "accepted",
    receipt: {
      runId: "run",
      presentationId: "presentation",
      receiptId: "accepted-chord",
      notes: pitches.map((pitch) => ({ noteId: `note-${String(pitch)}`, staffBeat: 0, pitch }))
    }
  });
}

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("exact feedback heads inside VexFlow chords", () => {
  it.each([1, -1])(
    "uses the public chord key indexes with stem direction %i and shuffled GraphicalNotes",
    (stemDirection) => {
      const { host, svg } = stage();
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const heads = [headAt(100), headAt(80), headAt(60)];
      group.append(...heads);
      svg.append(group);
      const chord = { getStemDirection: () => stemDirection } as unknown as Parameters<
        VexFlowGraphicalNote["setIndex"]
      >[0];
      // GraphicalNote traversal is intentionally neither pitch order nor VF key order.
      const notes = [
        graphicalNote(67, 2, group, heads, chord),
        graphicalNote(60, 0, group, heads, chord),
        graphicalNote(64, 1, group, heads, chord)
      ];
      const indexed = indexNotes(score([notes]));
      for (const [keyIndex, pitch] of [60, 64, 67].entries()) {
        expect(indexed.feedbackHeads?.get(markKey(0, pitch))).toEqual([heads[keyIndex]]);
        // Existing review/live painting retains its old complete chord shapes.
        expect(indexed.heads.get(markKey(0, pitch))).toHaveLength(6);
      }
      const owner = new LessonStaffFeedbackOverlay(host, () => indexed);
      accept(owner, [60, 64, 67]);
      const pulses = [...host.querySelectorAll<HTMLDivElement>(".staff-feedback__pulse")];
      expect(pulses.map((pulse) => pulse.dataset.noteId)).toEqual([
        "note-60",
        "note-64",
        "note-67"
      ]);
      expect(pulses.map((pulse) => pulse.style.top)).toEqual(["104px", "84px", "64px"]);
      owner.dispose();
    }
  );

  it("still skips a true unison belonging to different VF notes/voices", () => {
    const { host, svg } = stage();
    const voices = [40, 110].map((y) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const head = headAt(y);
      group.append(head);
      svg.append(group);
      const chord = {} as Parameters<VexFlowGraphicalNote["setIndex"]>[0];
      return [graphicalNote(60, 0, group, [head], chord)];
    });
    const indexed = indexNotes(score(voices));
    expect(indexed.feedbackHeads?.get(markKey(0, 60))).toHaveLength(2);
    const owner = new LessonStaffFeedbackOverlay(host, () => indexed);
    accept(owner, [60]);
    expect(host.querySelectorAll(".staff-feedback__pulse")).toHaveLength(0);
    owner.dispose();
  });

  it("skips absent, negative, fractional or out-of-range public key indexes without falling back to chord shapes", () => {
    const { host, svg } = stage();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const heads = [headAt(40), headAt(70), headAt(100)];
    group.append(...heads);
    svg.append(group);
    const chord = {} as Parameters<VexFlowGraphicalNote["setIndex"]>[0];
    const note = graphicalNote(60, 0, group, heads, chord);
    for (const index of [-1, 0.5, 3, Number.NaN]) {
      note.vfnoteIndex = index;
      expect(feedbackNotehead(note)).toBeUndefined();
    }
    Object.defineProperty(note, "vfnoteIndex", { value: undefined });
    const indexed = indexNotes(score([[note]]));
    expect(indexed.heads.get(markKey(0, 60))).toHaveLength(6);
    expect(indexed.feedbackHeads?.size).toBe(0);
    const owner = new LessonStaffFeedbackOverlay(host, () => indexed);
    accept(owner, [60]);
    expect(host.querySelectorAll(".staff-feedback__pulse")).toHaveLength(0);
    owner.dispose();
  });
});
