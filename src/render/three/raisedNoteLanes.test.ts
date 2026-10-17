import { InstancedMesh, Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import { BLACK_NOTE_FLOOR } from "../noteDimensions";
import type { NoteLaneProjection } from "../noteLaneProjection";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { ThreeNoteAura } from "./ThreeNoteAura";
import { ThreeRoadTrails } from "./ThreeRoadTrails";
import { worldCamera } from "../worldCamera";

const lane: NoteLaneProjection = {
  y: BLACK_NOTE_FLOOR,
  scaleX: 1.1,
  offsetX: 0.03,
  offsetY: -0.02,
  width: 1440,
  height: 900
};

describe("native raised note layers", () => {
  it("carries one raised lane through bodies, lava, halo, short bridges and reused anchors", () => {
    const camera = worldCamera(1440, 700);
    const frame = new ThreeRoadFrame();
    frame.add(720, 100, 200, 44, 0x00ffff, 1, 600, camera, 2, "held", 0, lane);
    frame.add(720, 250, 350, 44, 0x00ffff, 1, 600, camera, 2, "held2", 0, lane);
    frame.addTrailAnchor(720, 44, 0x00ffff, 1, camera, lane);
    expect(frame.notes.every((note) => note.lane === lane)).toBe(true);
    expect(frame.trailAnchors[0]?.lane).toBe(lane);
    const bodies = new ThreeRoadNotes();
    const aura = new ThreeNoteAura();
    const trails = new ThreeRoadTrails();
    bodies.update(frame.notes, 22);
    aura.update(frame.notes, 22);
    trails.update(frame.notes, 22, 0, 2, 10000);
    const matrix = new Matrix4();
    for (const group of [bodies.group, aura.group, trails.group])
      for (const child of group.children) {
        if (!(child instanceof InstancedMesh)) throw new Error("expected note mesh");
        const batch = child as InstancedMesh;
        expect(batch.count).toBeGreaterThan(0);
        const slots =
          Object.values(batch.geometry.attributes).reduce(
            (total, attribute) => total + Math.ceil(attribute.itemSize / 4),
            0
          ) +
          1 +
          4;
        expect(slots).toBeLessThanOrEqual(16);
        batch.getMatrixAt(0, matrix);
        expect(matrix.elements[13]).toBeGreaterThanOrEqual(BLACK_NOTE_FLOOR);
        const projection = batch.geometry.getAttribute("noteProjection");
        expect(projection.getX(0)).toBeCloseTo(lane.scaleX);
        expect(projection.getY(0)).toBeCloseTo(lane.offsetX);
        expect(projection.getZ(0)).toBeCloseTo(lane.offsetY);
      }
    frame.begin();
    frame.add(720, 100, 200, 44, 0x00ffff, 1, 600, camera);
    frame.addTrailAnchor(720, 44, 0x00ffff, 1, camera);
    expect(frame.notes[0]?.lane).toBeUndefined();
    expect(frame.trailAnchors[0]?.lane).toBeUndefined();
    bodies.update(frame.notes, 22);
    const child = bodies.group.children[0];
    if (!(child instanceof InstancedMesh)) throw new Error("expected note mesh");
    expect((child as InstancedMesh).geometry.getAttribute("noteProjection").getX(0)).toBe(1);
    for (const batch of [bodies, aura, trails]) batch.dispose();
  });
});
