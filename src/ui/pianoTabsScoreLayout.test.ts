import { describe, expect, it } from "vitest";
import type { ReaderGeometry } from "../staff/readerGeometry";
import type { Song } from "../song/song";
import { buildPianoTabs, positionInTabs, tabContentX } from "./pianoTabsLayout";
import { layoutTabsOnScore, scoreTabLabelSize } from "./pianoTabsScoreLayout";
import { spotAt } from "../staff/liveCursor";

const song: Song = {
  title: "Synthetic",
  source: "musicxml",
  duration: 8,
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 1, position: 1, downbeat: false }
  ],
  measures: [0, 4].map((start) => ({ start, length: 4, beats: 4, beatType: 4 })),
  notes: [
    {
      id: "a",
      start: 0.5,
      startBeat: 0.5,
      duration: 5.5,
      pitch: 60,
      hand: "right",
      scoreFinger: 1
    },
    { id: "b", start: 4, startBeat: 4, duration: 4, pitch: 48, hand: "left", scoreFinger: 5 }
  ]
};
const geometry: ReaderGeometry = {
  svgOffsetX: 400,
  viewportWidth: 800,
  spots: [
    { beat: 0, x: 50, line: 0 },
    { beat: 0.5, x: 90, line: 0 },
    { beat: 4, x: 230, line: 0 },
    { beat: 6, x: 260, line: 0 }
  ],
  systems: [
    {
      line: 0,
      startBeat: 0,
      endBeat: 8,
      width: 320,
      barlines: [
        { beat: 0, x: 30 },
        { beat: 4, x: 210 },
        { beat: 8, x: 320 }
      ]
    }
  ]
};

describe("layoutTabsOnScore", () => {
  it("uses score attack positions and separate barlines rather than independently sized intervals", () => {
    const rows = layoutTabsOnScore(buildPianoTabs(song), geometry);
    expect(rows[0]?.events.map((event) => event.left)).toEqual([90, 230]);
    expect(rows[0]?.barlines?.[1]?.x).toBe(210);
    expect(rows[0]?.events[1]?.event.notes[0]?.scoreFinger).toBe(5);
    for (const beat of [-2, 0, 0.25, 1, 3.9, 4, 5.5, 6, 7.8, 8]) {
      expect(positionInTabs(rows, beat)?.x).toBe(spotAt(geometry.spots, beat)?.x);
    }
    const row = rows[0];
    if (!row) throw new Error("Missing score row");
    expect(tabContentX(row, 8)).toBe(320);
    expect(scoreTabLabelSize(row, 90, "right", "соль", 1)).toBe(26);
  });

  it("fits wide Russian names between compressed score attacks without changing musical pixels", () => {
    const dense: Song = {
      ...song,
      notes: [0, 0.5].map((start) => ({
        id: String(start),
        start,
        startBeat: start,
        duration: 0.5,
        pitch: 67,
        hand: "right"
      }))
    };
    const rows = layoutTabsOnScore(buildPianoTabs(dense), geometry);
    const row = rows[0];
    if (!row) throw new Error("Missing row");
    expect(row.events.map((event) => event.left)).toEqual([50, 90]);
    const size = scoreTabLabelSize(row, 50, "right", "соль", 1);
    expect(size).toBeCloseTo(32 / 2.4);
    expect(size * 2.4 + 4).toBeLessThan(40);
  });

  it("uses score systems for wrapping and does not reattack a sustained note after the break", () => {
    const wrapped: ReaderGeometry = {
      ...geometry,
      spots: geometry.spots.map((spot) =>
        spot.beat >= 4 ? { ...spot, line: 150, x: spot.x - 180 } : spot
      ),
      systems: [
        { line: 0, startBeat: 0, endBeat: 4, width: 210, barlines: [{ beat: 4, x: 210 }] },
        {
          line: 150,
          startBeat: 4,
          endBeat: 8,
          width: 140,
          barlines: [
            { beat: 4, x: 30 },
            { beat: 8, x: 140 }
          ]
        }
      ]
    };
    const rows = layoutTabsOnScore(buildPianoTabs(song), wrapped);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.events.map((event) => event.attack)).toEqual([false, true]);
    expect(positionInTabs(rows, 4)).toEqual({ row: 1, x: 50 });
    expect(positionInTabs(rows, 3.9)?.row).toBe(0);
  });
});
