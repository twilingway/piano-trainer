// @vitest-environment happy-dom
import { VexFlowMeasure, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";

import { readStaffGeometry, readerSystems } from "./staffReaderGeometry";

describe("shared score reader geometry", () => {
  it("keeps barlines on measure edges when notes start after the bar", () => {
    expect(
      readerSystems([
        { line: 12, startBeat: 4, endBeat: 8, left: 220, right: 400 },
        { line: 12, startBeat: 0, endBeat: 4, left: 30, right: 220 },
        { line: 160, startBeat: 8, endBeat: 10, left: 30, right: 180 }
      ])
    ).toEqual([
      {
        line: 12,
        startBeat: 0,
        endBeat: 8,
        width: 400,
        barlines: [
          { beat: 0, x: 30 },
          { beat: 4, x: 220 },
          { beat: 8, x: 400 }
        ]
      },
      {
        line: 160,
        startBeat: 8,
        endBeat: 10,
        width: 180,
        barlines: [
          { beat: 8, x: 30 },
          { beat: 10, x: 180 }
        ]
      }
    ]);
  });

  it.each([
    [1, 1, 30, 262.5],
    [3, 1, 30, 258.75],
    [5, 1, 30, 258.75],
    [6, 1, 30, 258.75],
    [1, 4, 32.25, 262.5],
    [1, 6, 32.25, 262.5]
  ])(
    "extracts ending style %i at fitted zoom without shrinking content extent",
    (endType, beginType, beginX, endX) => {
      const measure = Object.create(VexFlowMeasure.prototype) as VexFlowMeasure;
      Object.assign(measure, {
        parentSourceMeasure: {
          AbsoluteTimestamp: { RealValue: 0 },
          Duration: { RealValue: 0.75 }
        },
        IsExtraGraphicalMeasure: false,
        getVFStave: () => ({
          getX: () => 40,
          getWidth: () => 320,
          // End instructions can shift the barline away from the measure's outer edge.
          getModifiers: (position: number) => [
            {
              getX: () => (position === 5 ? 40 : 350),
              getType: () => (position === 5 ? beginType : endType)
            }
          ]
        })
      });
      Object.defineProperty(measure, "PositionAndShape", {
        value: { AbsolutePosition: { x: 4 }, Size: { width: 32 } }
      });
      const osmd = {
        Zoom: 0.75,
        GraphicSheet: {
          MusicPages: [{ MusicSystems: [{ GraphicalMeasures: [[undefined, measure, measure]] }] }]
        }
      } as unknown as OpenSheetMusicDisplay;
      const host = document.createElement("div");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      host.append(svg);
      host.scrollLeft = 180;
      Object.defineProperty(host, "clientWidth", { value: 640 });
      host.getBoundingClientRect = () => new DOMRect(100, 0, 640, 160);
      svg.getBoundingClientRect = () => new DOMRect(270, 0, 500, 160);
      const spots = [{ beat: 1, x: 90, line: 12 }];
      const geometry = readStaffGeometry(osmd, host, spots, [{ top: 12 }]);
      expect(geometry.svgOffsetX).toBe(350);
      expect(geometry.viewportWidth).toBe(640);
      expect(geometry.spots).toEqual(spots);
      expect(geometry.spots).not.toBe(spots);
      expect(geometry.systems).toEqual([
        {
          line: 12,
          startBeat: 0,
          endBeat: 3,
          width: 270,
          barlines: [
            { beat: 0, x: beginX },
            { beat: 3, x: endX }
          ]
        }
      ]);
    }
  );
});
