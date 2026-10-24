import { Container } from "./flatThree";
import { describe, expect, it, vi } from "vitest";
import { drawRoadBeatBars } from "./RoadBeatBars";
import type { SongBeat } from "../song/song";

const beats: readonly SongBeat[] = [
  { time: 0, position: 0, downbeat: true },
  { time: 1, position: 1, downbeat: false },
  { time: 2, position: 2, downbeat: true },
  { time: 4, position: 4, downbeat: true }
];

describe("road measure bars", () => {
  it("projects only visible downbeats using the existing song time", () => {
    const bars = new Container();
    const road = { beatY: vi.fn((y: number) => y * 0.5) };
    drawRoadBeatBars(bars, beats, 800, 1, 3, 400, 100, road);
    expect(road.beatY.mock.calls).toEqual([[300], [100]]);
    expect(bars.children.map((bar) => [bar.y, bar.width, bar.height, bar.alpha])).toEqual([
      [150, 800, 2, 0.4],
      [50, 800, 2, 0.4]
    ]);
  });

  it("reuses sprites across frames, resizes them and hides unused bars", () => {
    const bars = new Container();
    const road = { beatY: (y: number) => y };
    drawRoadBeatBars(bars, beats, 800, 0, 4, 400, 100, road);
    const original = [...bars.children];
    expect(original).toHaveLength(3);
    drawRoadBeatBars(bars, beats, 500, 3, 1, 300, 300, road);
    expect(bars.children).toEqual(original);
    expect(bars.children.map((bar) => bar.visible)).toEqual([true, false, false]);
    expect(bars.children[0]?.width).toBe(500);
    drawRoadBeatBars(bars, beats, 500, 5, 1, 300, 300, road);
    expect(bars.children).toEqual(original);
    expect(bars.children.every((bar) => !bar.visible)).toBe(true);
  });
});
