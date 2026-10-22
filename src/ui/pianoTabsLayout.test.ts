import { describe, expect, it } from "vitest";

import { secondsAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import { buildPianoTabs, layoutPianoTabs, positionInTabs } from "./pianoTabsLayout";
import type { TabLayoutOptions } from "./pianoTabsLayout";

const defaults: TabLayoutOptions = {
  zoom: 1,
  singleLine: true,
  measuresPerLine: 0,
  viewportWidth: 800,
  noteNames: "en"
};

function fixture(
  notes: readonly { beat: number; length: number; pitch?: number; hand?: "left" | "right" }[],
  measures = 2,
  beats: Song["beats"] = [
    { time: 0, position: 0, downbeat: true },
    { time: 0.5, position: 1, downbeat: false }
  ]
): Song {
  const base: Song = {
    title: "Synthetic",
    source: "musicxml",
    notes: [],
    beats,
    measures: Array.from({ length: measures }, (_, index) => ({
      start: index * 4,
      length: 4,
      beats: 4,
      beatType: 4
    })),
    duration: 0
  };
  const events: SongNote[] = notes.map((note, index) => ({
    id: `note-${String(index)}`,
    startBeat: note.beat,
    start: secondsAt(base, note.beat),
    duration: secondsAt(base, note.beat + note.length) - secondsAt(base, note.beat),
    pitch: note.pitch ?? 60,
    hand: note.hand ?? "right",
    scoreFinger: 1
  }));
  return {
    ...base,
    notes: events,
    duration: Math.max(
      secondsAt(base, measures * 4),
      ...events.map((note) => note.start + note.duration)
    )
  };
}

describe("buildPianoTabs", () => {
  it("groups simultaneous notes by hand while retaining independent releases and original fingers", () => {
    const song = fixture([
      { beat: 0, length: 1, pitch: 60 },
      { beat: 0, length: 3, pitch: 64 },
      { beat: 0, length: 2, pitch: 48, hand: "left" }
    ]);
    const model = buildPianoTabs(song);
    expect(model.boundaries).toEqual([0, 1, 2, 3, 4, 8]);
    expect([...model.measures]).toEqual([0, 4]);
    expect(model.events).toHaveLength(2);
    expect(model.events[0]).toMatchObject({
      hand: "right",
      start: 0,
      end: 1.5,
      startBeat: 0,
      endBeat: 3,
      firstColumn: 1,
      lastColumn: 4
    });
    expect(model.events[0]?.notes).toEqual([song.notes[1], song.notes[0]]);
    expect(model.events[0]?.notes.map((note) => note.duration)).toEqual([1.5, 0.5]);
    expect(song.notes.map((note) => note.pitch)).toEqual([60, 64, 48]);
  });

  it("converts releases through a changing tempo rather than dividing by onset tempo", () => {
    const song = fixture([{ beat: 1, length: 2 }], 1, [
      { time: 0, position: 0, downbeat: true },
      { time: 1, position: 1, downbeat: false },
      { time: 2, position: 2, downbeat: false },
      { time: 2.5, position: 3, downbeat: false },
      { time: 3, position: 4, downbeat: true }
    ]);
    const event = buildPianoTabs(song).events[0];
    expect(event).toMatchObject({ start: 1, end: 2.5, startBeat: 1, endBeat: 3 });
  });
});

describe("layoutPianoTabs", () => {
  it("keeps short music compact and independent of the viewport in one-line mode", () => {
    const model = buildPianoTabs(fixture([{ beat: 0, length: 1 }], 1));
    const narrow = layoutPianoTabs(model, { ...defaults, viewportWidth: 200 });
    const wide = layoutPianoTabs(model, { ...defaults, viewportWidth: 3440 });
    expect(narrow).toEqual(wide);
    expect(wide[0]?.width).toBe(272);
    expect(wide[0]?.boundaries).toEqual([0, 1, 4]);
    expect(wide[0]?.offsets).toEqual([0, 68, 272]);
  });

  it("leaves room for dense events and Russian names, with all distances scaled by zoom", () => {
    const model = buildPianoTabs(
      fixture(
        [
          { beat: 0, length: 0.25 },
          { beat: 0.25, length: 0.25 }
        ],
        1
      )
    );
    const english = layoutPianoTabs(model, defaults)[0];
    const russian = layoutPianoTabs(model, { ...defaults, noteNames: "ru" })[0];
    const zoomed = layoutPianoTabs(model, { ...defaults, zoom: 2 })[0];
    const unnamed = layoutPianoTabs(model, { ...defaults, noteNames: "off" })[0];
    expect(english?.offsets).toEqual([0, 36, 72, 310]);
    expect(russian?.offsets).toEqual([0, 88, 176, 414]);
    expect(zoomed?.offsets).toEqual([0, 72, 144, 620]);
    expect(unnamed).toEqual(english);
  });

  it.each([1, 2])(
    "keeps adjacent fast Russian G and G sharp labels readable at zoom %s",
    (zoom) => {
      const model = buildPianoTabs(
        fixture(
          [
            { beat: 0, length: 0.125, pitch: 67 },
            { beat: 0.125, length: 0.125, pitch: 68 }
          ],
          1
        )
      );
      const row = layoutPianoTabs(model, { ...defaults, noteNames: "ru", zoom })[0];
      const first = row?.events[0];
      const second = row?.events[1];
      expect(first?.event.notes[0]?.pitch).toBe(67);
      expect(second?.event.notes[0]?.pitch).toBe(68);
      expect(first?.width).toBe(88 * zoom);
      expect(second?.left).toBe(88 * zoom);
      expect(second?.width).toBe(88 * zoom);
      // The longest name, five monospace characters plus padding, needs 84 px at base scale.
      expect((second?.left ?? 0) - (first?.left ?? 0)).toBeGreaterThanOrEqual(84 * zoom);
    }
  );

  it("auto-wraps only on measure edges and keeps an oversized measure horizontally scrollable", () => {
    const model = buildPianoTabs(fixture([{ beat: 0, length: 12 }], 3));
    const narrow = layoutPianoTabs(model, { ...defaults, singleLine: false, viewportWidth: 100 });
    expect(narrow.map((row) => [row.startBeat, row.endBeat, row.width])).toEqual([
      [0, 4, 272],
      [4, 8, 272],
      [8, 12, 272]
    ]);
    const wider = layoutPianoTabs(model, { ...defaults, singleLine: false, viewportWidth: 544 });
    expect(wider.map((row) => [row.startBeat, row.endBeat])).toEqual([
      [0, 8],
      [8, 12]
    ]);
  });

  it("counts measures for fixed rows even if their musical lengths differ", () => {
    const source = fixture([{ beat: 0, length: 13 }], 0);
    const song: Song = {
      ...source,
      measures: [
        { start: 0, length: 1, beats: 4, beatType: 4 },
        { start: 1, length: 4, beats: 4, beatType: 4 },
        { start: 5, length: 3, beats: 3, beatType: 4 },
        { start: 8, length: 4, beats: 4, beatType: 4 },
        { start: 12, length: 1, beats: 4, beatType: 4 }
      ]
    };
    const rows = layoutPianoTabs(buildPianoTabs(song), {
      ...defaults,
      singleLine: false,
      measuresPerLine: 2,
      viewportWidth: 100
    });
    expect(rows.map((row) => [row.startBeat, row.endBeat])).toEqual([
      [0, 5],
      [5, 12],
      [12, 13]
    ]);
  });

  it("continues a held event on the next row without repeating its attack", () => {
    const song = fixture([{ beat: 3, length: 3 }], 2);
    const rows = layoutPianoTabs(buildPianoTabs(song), {
      ...defaults,
      singleLine: false,
      viewportWidth: 300
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.events[0]).toMatchObject({ left: 204, width: 68, attack: true });
    expect(rows[1]?.events[0]).toMatchObject({ left: 0, width: 136, attack: false });
    expect(rows[0]?.events[0]?.event).toBe(rows[1]?.events[0]?.event);
  });

  it("preserves leading silence, trailing rests and the natural score end", () => {
    const song = fixture([{ beat: 2, length: 1 }], 1);
    const row = layoutPianoTabs(buildPianoTabs(song), defaults)[0];
    expect(row?.boundaries).toEqual([0, 2, 3, 4]);
    expect(row?.events[0]).toMatchObject({ left: 136, width: 68, attack: true });
    expect(row?.width).toBe(272);
  });
});

describe("positionInTabs", () => {
  it("moves continuously inside holds and rests, clamping before and after music", () => {
    const rows = layoutPianoTabs(buildPianoTabs(fixture([{ beat: 1, length: 2 }], 1)), defaults);
    expect(positionInTabs(rows, -2)).toEqual({ row: 0, x: 0 });
    expect(positionInTabs(rows, 0.5)).toEqual({ row: 0, x: 34 });
    expect(positionInTabs(rows, 1.5)).toEqual({ row: 0, x: 102 });
    expect(positionInTabs(rows, 3.5)).toEqual({ row: 0, x: 238 });
    expect(positionInTabs(rows, 20)).toEqual({ row: 0, x: 272 });
  });

  it("selects the new row at its exact boundary and supports seeking back", () => {
    const rows = layoutPianoTabs(buildPianoTabs(fixture([{ beat: 0, length: 8 }], 2)), {
      ...defaults,
      singleLine: false,
      viewportWidth: 300
    });
    expect(positionInTabs(rows, 3.5)).toEqual({ row: 0, x: 238 });
    expect(positionInTabs(rows, 4)).toEqual({ row: 1, x: 0 });
    expect(positionInTabs(rows, 5)).toEqual({ row: 1, x: 68 });
    expect(positionInTabs(rows, 2)).toEqual({ row: 0, x: 136 });
    expect(positionInTabs(rows, 8)).toEqual({ row: 1, x: 272 });
  });

  it("handles an empty song and invalid positions without inventing a cursor", () => {
    const rows = layoutPianoTabs(buildPianoTabs(fixture([], 0)), defaults);
    expect(rows).toEqual([]);
    expect(positionInTabs(rows, 0)).toBeUndefined();
    expect(
      positionInTabs(layoutPianoTabs(buildPianoTabs(fixture([], 1)), defaults), NaN)
    ).toBeUndefined();
  });
});
