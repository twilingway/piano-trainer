import { describe, expect, it } from "vitest";
import { performanceStageLayout, stageNotePoint } from "./performanceStageLayout";
const bounds = { min: { x: -650, y: -700, z: -200 }, max: { x: 650, y: 1200, z: 700 } };
describe("raised circular performance stage", () => {
  it("fits all instrument/performer corners and scales in physical units", () => {
    const stage = performanceStageLayout(bounds),
      scaled = performanceStageLayout(
        { min: { x: -1300, y: -1400, z: -400 }, max: { x: 1300, y: 2400, z: 1400 } },
        2
      );
    expect(stage.top).toBe(-708);
    expect(stage.thickness).toBe(120);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const z of [bounds.min.z, bounds.max.z])
        expect(Math.hypot(x - stage.centre.x, z - stage.centre.z)).toBeLessThan(stage.radius);
    expect(scaled.radius).toBeCloseTo(stage.radius * 2);
    expect(scaled.thickness).toBe(240);
  });
  it("puts the first octave at twelve, higher clockwise and lower counterclockwise", () => {
    const stage = performanceStageLayout(bounds);
    for (let octave = 0; octave <= 8; octave++) {
      const first = stageNotePoint(Math.max(21, (octave + 1) * 12), stage);
      if (!first) throw new Error("Missing octave sector");
      expect(first.sectorAngle).toBeCloseTo(((octave - 4) * Math.PI * 2) / 9);
    }
    const c = stageNotePoint(60, stage),
      b = stageNotePoint(71, stage);
    if (!c || !b) throw new Error("Missing first octave");
    expect((c.angle + b.angle) / 2).toBeCloseTo(0);
    expect(c.x).toBeLessThan(stage.centre.x);
    expect(b.x).toBeGreaterThan(stage.centre.x);
  });
  it("gives every physical key a unique point on the same rim", () => {
    const stage = performanceStageLayout(bounds),
      points = new Set<string>();
    for (let pitch = 21; pitch <= 108; pitch++) {
      const p = stageNotePoint(pitch, stage);
      if (!p) throw new Error("Missing key");
      expect(Math.hypot(p.x - stage.centre.x, p.z - stage.centre.z)).toBeCloseTo(
        stage.radius * 0.96
      );
      points.add(String(p.x) + ":" + String(p.z));
    }
    expect(points.size).toBe(88);
    for (const pitch of [20, 109, 60.5, NaN]) expect(stageNotePoint(pitch, stage)).toBeUndefined();
  });
});
