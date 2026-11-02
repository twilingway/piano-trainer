// @vitest-environment happy-dom
import { AdditiveBlending, InstancedMesh, Matrix4, NormalBlending, Color, Texture } from "three";
import type { PlaneGeometry, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { FlatNoteBlocks } from "../FlatNoteBlocks";
import type { NineSliceSprite } from "../flatThree";
import { flatNoteMaskMetrics, ThreeFlatRoadNotes } from "./ThreeFlatRoadNotes";
import type { WorldRoadNote } from "./roadNoteGeometry";

const note = (change: Partial<WorldRoadNote> = {}): WorldRoadNote => ({
  x: 20,
  top: 242,
  bottom: 142,
  width: 20,
  color: 0x00ccff,
  alpha: 0.7,
  materialUnitX: 0.5,
  materialUnitZ: 2,
  pitch: 60,
  ...change
});
function layers(view: ThreeFlatRoadNotes) {
  return view.group.children.filter(
    (child): child is InstancedMesh<PlaneGeometry, ShaderMaterial> => child instanceof InstancedMesh
  );
}
function shape(view: ThreeFlatRoadNotes, index: number) {
  const attribute = layers(view)[index]?.geometry.getAttribute("noteShape");
  if (!attribute) throw new Error("Expected baked note dimensions");
  return [attribute.getX(0), attribute.getY(0), attribute.getZ(0), attribute.getW(0)];
}

function pictureWidth(mesh: InstancedMesh<PlaneGeometry, ShaderMaterial> | undefined): number {
  const picture: unknown = mesh?.material.uniforms.picture?.value;
  if (!(picture instanceof Texture)) throw new Error("Expected the shared baked mask texture");
  const image: unknown = picture.image;
  if (
    typeof image !== "object" ||
    image === null ||
    !("width" in image) ||
    typeof image.width !== "number"
  )
    throw new Error("Expected a canvas mask");
  return image.width;
}

describe("projected direct-view note masks", () => {
  it.each([
    [40, 150],
    [22, 90],
    [8, 4]
  ])("matches the actual direct nine-slice corner geometry at %s x %s pixels", (width, height) => {
    const direct = new FlatNoteBlocks();
    direct.begin();
    direct.draw(100, 0, width, height, 0x00ccff, 0.7);
    const face = direct.container.children[0] as NineSliceSprite;
    face.updateGeometry();
    const firstCornerX = (face.geometry.positions[2] ?? 0) * face.scale.x;
    const firstCornerY = (face.geometry.positions[9] ?? 0) * face.scale.y;
    const metrics = { width: 0, depth: 0, capX: 0, capZ: 0 };
    flatNoteMaskMetrics(note({ width: width * 0.5, top: 142 + height * 2 }), "face", metrics);
    expect(metrics.width / 0.5).toBeCloseTo(width);
    expect(metrics.depth / 2).toBeCloseTo(height);
    expect(metrics.capX / 0.5).toBeCloseTo(firstCornerX);
    expect(metrics.capZ / 2).toBeCloseTo(firstCornerY);
    direct.destroy();
  });

  it("uses the same baked layers, blend order, white bevel and broad bloom", () => {
    const view = new ThreeFlatRoadNotes(4);
    view.update([note()], 22);
    const meshes = layers(view);
    expect(meshes.map((mesh) => String(mesh.userData.flatNoteLayer))).toEqual([
      "bloom",
      "face",
      "emission",
      "bevel",
      "plate",
      "face",
      "emission",
      "bevel"
    ]);
    expect(meshes.map((mesh) => mesh.count)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(meshes.map((mesh) => mesh.renderOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(meshes[0]?.material.blending).toBe(AdditiveBlending);
    expect(meshes[1]?.material.blending).toBe(NormalBlending);
    expect(shape(view, 1)).toEqual([20, 100, 3.75, 15]);
    expect(shape(view, 0)).toEqual([50, 220, 18.75, 75]);
    const bevel = meshes[3];
    if (!bevel) throw new Error("Expected white bevel");
    const color = new Color();
    bevel.getColorAt(0, color);
    expect(color.toArray()).toEqual([1, 1, 1]);
    expect(meshes[1]?.geometry.getAttribute("noteAlphaPitch").getX(0)).toBeCloseTo(0.7);
    expect(pictureWidth(meshes[0])).toBe(160);
    expect(pictureWidth(meshes[1])).toBe(64);
    view.dispose();
  });

  it("puts black-key masks above white faces on the identical opaque plate", () => {
    const view = new ThreeFlatRoadNotes(4);
    view.update([note(), note({ pitch: 61, x: 30 })], 22);
    const meshes = layers(view);
    expect(meshes.map((mesh) => mesh.count)).toEqual([2, 1, 1, 1, 1, 1, 1, 1]);
    expect(shape(view, 4)).toEqual([20, 100, 3.75, 15]);
    expect(meshes[4]?.material.blending).toBe(NormalBlending);
    expect(meshes[4]?.geometry.getAttribute("noteAlphaPitch").getX(0)).toBe(1);
    expect(pictureWidth(meshes[4])).toBe(64);
    const matrix = new Matrix4();
    meshes[5]?.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(30);
    expect(matrix.elements[13]).toBe(22);
    expect(matrix.elements[14]).toBe(-192);
    view.dispose();
  });

  it("keeps the pool bounded, preserves projection and reuses GPU resources", () => {
    const view = new ThreeFlatRoadNotes(2);
    const meshes = layers(view);
    const resources = meshes.map((mesh) => ({
      geometry: mesh.geometry,
      material: mesh.material,
      matrix: mesh.instanceMatrix
    }));
    view.update(
      [
        note({
          lane: { y: 50, scaleX: 1.2, offsetX: 0.1, offsetY: -0.2, width: 800, height: 600 }
        }),
        note({ x: 50 }),
        note({ x: 70 })
      ],
      22
    );
    expect(meshes[0]?.count).toBe(2);
    const projection = meshes[1]?.geometry.getAttribute("noteProjection");
    expect(projection?.getX(0)).toBeCloseTo(1.2);
    expect(projection?.getY(0)).toBeCloseTo(0.1);
    expect(projection?.getZ(0)).toBeCloseTo(-0.2);
    view.update([note({ top: 142.1 })], 22);
    meshes.forEach((mesh, index) => {
      expect(mesh.geometry).toBe(resources[index]?.geometry);
      expect(mesh.material).toBe(resources[index]?.material);
      expect(mesh.instanceMatrix).toBe(resources[index]?.matrix);
    });
    view.update([], 22);
    expect(view.group.visible).toBe(false);
    expect(meshes.every((mesh) => mesh.count === 0)).toBe(true);
    view.dispose();
  });

  it("rejects malformed dimensions and disposes every resource once", () => {
    const view = new ThreeFlatRoadNotes(4);
    const meshes = layers(view);
    const disposals = meshes.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    view.update(
      [
        note({ width: NaN }),
        note({ materialUnitZ: Infinity }),
        note({ alpha: 0 }),
        note({ top: 142 })
      ],
      22
    );
    expect(view.group.visible).toBe(false);
    view.dispose();
    view.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
