// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { InstancedMesh, BufferGeometry, BufferAttribute } from "three";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { ThreeFlatRoadNotes } from "./ThreeFlatRoadNotes";
import { ThreeNoteAura } from "./ThreeNoteAura";
import { ThreeRoadTrails } from "./ThreeRoadTrails";

it("shares physical contact and free-source endpoint across every note style, aura and trail", () => {
  const lane = {
    y: 34,
    depth: 145.8,
    scaleX: 1,
    offsetX: 0,
    offsetY: 0,
    width: 1280,
    height: 720,
    freeFar: { x: 1234, y: 8022, z: -20450 }
  };
  const note: WorldRoadNote = {
    x: 40,
    width: 20,
    top: 500,
    bottom: 200,
    color: 0x00ff88,
    alpha: 1,
    duration: 2,
    pitch: 61,
    lane
  };
  const native = new ThreeRoadNotes(4),
    flat = new ThreeFlatRoadNotes(4),
    aura = new ThreeNoteAura(),
    trails = new ThreeRoadTrails();
  native.update([note], 22);
  flat.update([note], 22);
  aura.update([note], 22);
  trails.update([note, { ...note, bottom: 540, top: 700 }], 22, 0, 2, 200);
  for (const layer of [native, flat, aura, trails]) {
    let seen = 0;
    for (const object of layer.group.children) {
      if (!(object instanceof InstancedMesh) || object.count === 0) continue;
      const geometry: unknown = object.geometry;
      if (!(geometry instanceof BufferGeometry)) throw new Error("Expected native buffer geometry");
      const contact: unknown = geometry.getAttribute("noteContact");
      if (!(contact instanceof BufferAttribute))
        throw new Error("Expected packed contact attribute");
      expect(contact.itemSize).toBe(4);
      expect(contact.getX(0)).toBe(34);
      expect(contact.getY(0)).toBeCloseTo(145.8, 4);
      expect(contact.getZ(0)).toBe(1234);
      expect(contact.getW(0)).toBe(8022);
      expect(geometry.hasAttribute("noteRoute")).toBe(false);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
    layer.dispose();
  }
});
