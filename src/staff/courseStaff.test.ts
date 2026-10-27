// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { courseCursor, courseRangeIndices, courseStaffXml, courseStaffZoom } from "./courseStaff";

const score = (implicit: boolean) =>
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1"${implicit ? ' implicit="yes"' : ""}><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>`;

describe("courseStaffXml", () => {
  it("hides the time signature of an implicit measure", () => {
    const shown = new DOMParser().parseFromString(courseStaffXml(score(true)), "application/xml");
    expect(shown.querySelector("time")?.getAttribute("print-object")).toBe("no");
    expect(shown.querySelector("note pitch step")?.textContent).toBe("F");
  });

  it("leaves complete measures and malformed input untouched", () => {
    expect(courseStaffXml(score(false))).toBe(score(false));
    expect(courseStaffXml("<not-xml")).toBe("<not-xml");
  });

  it("drops the tempo mark but keeps the time signature of a complete measure", () => {
    const tempo = score(false).replace(
      "</attributes>",
      '</attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>'
    );
    const shown = new DOMParser().parseFromString(courseStaffXml(tempo), "application/xml");
    expect(shown.querySelector("metronome")).toBeNull();
    expect(shown.querySelector("direction")).toBeNull();
    expect(shown.querySelector("note pitch step")?.textContent).toBe("F");
    expect(shown.querySelector("time")?.hasAttribute("print-object")).toBe(false);
  });
});

describe("courseStaffZoom", () => {
  it("fits the tighter of height and width", () => {
    expect(courseStaffZoom({ width: 100, height: 50 }, { width: 400, height: 100 })).toBe(2);
    expect(courseStaffZoom({ width: 300, height: 50 }, { width: 330, height: 500 })).toBeCloseTo(
      1.1
    );
    expect(courseStaffZoom({ width: 300, height: 50 }, { width: 600, height: 75 })).toBeCloseTo(
      1.5
    );
  });

  it("stays between the ordinary size and three times it", () => {
    expect(courseStaffZoom({ width: 10, height: 10 }, { width: 1000, height: 1000 })).toBe(3);
    expect(courseStaffZoom({ width: 1000, height: 100 }, { width: 100, height: 100 })).toBe(1);
  });

  it("keeps the ordinary size when nothing is measured", () => {
    expect(courseStaffZoom({ width: 0, height: 0 }, { width: 300, height: 300 })).toBe(1);
  });
});

describe("courseCursor", () => {
  it("hides the cursor over a single position", () => {
    expect(courseCursor(1, 10).hidden).toBe(true);
    expect(courseCursor(0, 10).hidden).toBe(true);
  });

  it("puts the cursor left of the notehead when there is more than one position", () => {
    expect(courseCursor(4, 10)).toEqual({ hidden: false, offsetX: -14 });
  });
});

describe("courseRangeIndices", () => {
  it("picks the first prompts with the lowest and the highest note", () => {
    expect(courseRangeIndices([[64], [60], [67], [60], [67]])).toEqual([1, 2]);
  });

  it("picks each voice's extremes once", () => {
    // Right hand first, left hand second: the hands' extremes sit in different prompts.
    expect(
      courseRangeIndices([
        [72, 48],
        [76, 43],
        [67, 50],
        [76, 48]
      ])
    ).toEqual([1, 2]);
    expect(
      courseRangeIndices([
        [60, 40],
        [62, 45],
        [70, 42]
      ])
    ).toEqual([0, 1, 2]);
  });

  it("returns nothing for an empty exercise", () => {
    expect(courseRangeIndices([])).toEqual([]);
  });
});
