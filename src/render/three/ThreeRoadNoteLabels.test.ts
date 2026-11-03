import { Group, InstancedMesh, Matrix4, Texture, Vector2 } from "three";
import type { BufferGeometry, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { noteSlabHeight } from "../noteDimensions";
import { fallingNoteName } from "../bakeLabels";
import { bakeNativeNoteLabelAtlas } from "./nativeNoteLabelAtlas";
import { NATIVE_NOTE_LABEL_CAPACITY, ThreeRoadNoteLabels } from "./ThreeRoadNoteLabels";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import { roadWidthUniforms } from "./roadWidthUniforms";
import type { WorldRoadNote } from "./roadNoteGeometry";

const note = (changes: Partial<WorldRoadNote> = {}): WorldRoadNote => ({
  x: 42,
  top: 320,
  bottom: 142,
  width: 20,
  color: 0x0080ff,
  alpha: 0.8,
  finger: 3,
  label: "до♯",
  pitch: 61,
  ...changes
});

function canvasFixture(available = true) {
  const context = {
    measureText: vi.fn((value: string) => ({ width: value.length * 40 })),
    strokeText: vi.fn(),
    fillText: vi.fn()
  };
  const create = vi.fn(
    (width: number, height: number) =>
      ({
        width,
        height,
        getContext: () => (available ? context : null)
      }) as unknown as HTMLCanvasElement
  );
  return { context, create };
}

function mesh(view: ThreeRoadNoteLabels): InstancedMesh<BufferGeometry, ShaderMaterial> {
  const child = view.group.children[0];
  if (!(child instanceof InstancedMesh)) throw new Error("Expected bounded caption batch");
  return child as InstancedMesh<BufferGeometry, ShaderMaterial>;
}

describe("native note label atlas", () => {
  it("bakes every finger and both name alphabets including sharps in one canvas", () => {
    const canvas = canvasFixture();
    const atlas = bakeNativeNoteLabelAtlas(canvas.create);
    expect(atlas).toBeDefined();
    expect(canvas.create).toHaveBeenCalledOnce();
    expect(canvas.context.fillText).toHaveBeenCalledTimes(29);
    expect(atlas?.glyphs.size).toBe(29);
    for (let finger = 1; finger <= 5; finger++)
      expect(atlas?.glyphs.has(String(finger))).toBe(true);
    for (const language of ["ru", "en"] as const)
      for (let pitch = 0; pitch < 12; pitch++) {
        const glyph = atlas?.glyphs.get(fallingNoteName(language, pitch));
        expect(glyph?.aspect).toBeGreaterThan(0);
        expect((glyph?.u ?? 0) + (glyph?.width ?? 0)).toBeLessThanOrEqual(1);
        expect((glyph?.v ?? 0) + (glyph?.height ?? 0)).toBeLessThanOrEqual(1);
      }
    atlas?.texture.dispose();
  });

  it("keeps fallback available when context creation is absent or throws", () => {
    const unavailable = new ThreeRoadNoteLabels(2, canvasFixture(false).create);
    const failed = new ThreeRoadNoteLabels(2, () => {
      throw new Error("Canvas unavailable");
    });
    for (const view of [unavailable, failed]) {
      expect(view.ready).toBe(false);
      view.update([note()], 22);
      expect(view.group.visible).toBe(false);
      expect(view.group.children).toHaveLength(0);
      expect(() => {
        view.dispose();
        view.dispose();
      }).not.toThrow();
    }
  });
});

describe("bounded native note captions", () => {
  it("keeps caption opacity independent of world width and the dock camera's depth range", () => {
    const view = new ThreeRoadNoteLabels(2, canvasFixture().create);
    const batch = mesh(view);
    view.update([note({ width: 8, alpha: 1 }), note({ width: 80, alpha: 0.6 })], 22, true);
    const alpha = batch.geometry.getAttribute("noteAlphaPitch");
    expect(alpha.getX(0)).toBe(1);
    expect(alpha.getX(1)).toBe(1);
    expect(alpha.getX(2)).toBeCloseTo(0.6);
    const fragment = batch.material.fragmentShader;
    expect(fragment).toContain("fwidth(gl_FragCoord.z) * 2.0");
    expect(fragment).toContain("smoothstep(0.0, nearEdge, gl_FragCoord.z)");
    expect(fragment).not.toContain("captionWidth");
    expect(batch.material.vertexShader).not.toContain("captionNearGap");
    expect(batch.material.depthTest).toBe(true);
    view.dispose();
  });

  it("billboards upright screen quads from one transformed head anchor and shared stack", () => {
    const view = new ThreeRoadNoteLabels(2, canvasFixture().create);
    view.setViewport(1334, 750);
    view.update([note()], 22);
    const batch = mesh(view);
    const shape = batch.geometry.getAttribute("labelShape");
    const aspects = batch.geometry.getAttribute("labelAspects");
    expect([shape.getX(0), shape.getY(0), shape.getZ(0)]).toEqual([20, 178, -1]);
    expect([shape.getX(1), shape.getY(1), shape.getZ(1)]).toEqual([20, 178, 1]);
    expect(aspects.getX(0)).toBe(aspects.getX(1));
    expect(aspects.getY(0)).toBe(aspects.getY(1));
    const first = new Matrix4();
    const second = new Matrix4();
    batch.getMatrixAt(0, first);
    batch.getMatrixAt(1, second);
    expect(first.elements).toEqual(second.elements);
    const viewport: unknown = batch.material.uniforms.viewport?.value;
    expect(viewport).toEqual(new Vector2(1334, 750));
    expect(batch.material.vertexShader).toContain(
      "vec4 clip = projectRoadLanePoint(vec4(slabPoint, 1.0))"
    );
    expect(batch.material.vertexShader).toContain(
      "projectRoadLanePoint(vec4(0.0, topY, anchorZ, 1.0))"
    );
    expect(batch.material.fragmentShader).toContain("vec2 point = captionClip.xy / captionClip.w");
    expect(batch.material.vertexShader).toContain("direction * offset * (2.0 / viewport)");
    expect(batch.material.polygonOffset).toBe(true);
    expect(batch.material.polygonOffsetFactor).toBeLessThan(0);
    expect(batch.material.polygonOffsetUnits).toBeLessThan(0);
    expect(batch.material.depthTest).toBe(true);
    view.dispose();
  });
  it("updates names and missing fields without baking, reallocating or retaining old captions", () => {
    const canvas = canvasFixture();
    const view = new ThreeRoadNoteLabels(2, canvas.create);
    const batch = mesh(view);
    const geometry = batch.geometry;
    const matrix = batch.instanceMatrix;
    const shape = geometry.getAttribute("labelShape");
    const material = batch.material;
    const picture: unknown = material.uniforms.picture?.value;
    view.update([note(), note({ finger: undefined, label: "G♯" }), note()], 22);
    expect(batch.count).toBe(3);
    view.update([note({ finger: undefined }), note({ finger: 0, label: undefined })], 22);
    expect(batch.count).toBe(1);
    view.update([note({ label: undefined }), note({ finger: 9, label: "unsupported" })], 22);
    expect(batch.count).toBe(1);
    view.update([note({ finger: undefined, label: undefined })], 22);
    expect(batch.count).toBe(0);
    expect(view.group.visible).toBe(false);
    expect(view.group.children).toHaveLength(1);
    expect(batch.geometry).toBe(geometry);
    expect(batch.instanceMatrix).toBe(matrix);
    expect(geometry.getAttribute("labelShape")).toBe(shape);
    expect(batch.material).toBe(material);
    expect(material.uniforms.picture?.value).toBe(picture);
    expect(canvas.create).toHaveBeenCalledOnce();
    expect(canvas.context.fillText).toHaveBeenCalledTimes(29);
    expect(canvas.context.strokeText).toHaveBeenCalledTimes(29);
    view.dispose();
  });

  it.each([false, true])("shares the exact body route and surface with flat=%s", (flat) => {
    const view = new ThreeRoadNoteLabels(2, canvasFixture().create);
    const source = note({
      lane: {
        y: 34,
        scaleX: 1.4,
        offsetX: 0.1,
        offsetY: 0.2,
        width: 800,
        height: 600,
        depth: 180,
        freeFar: { x: -90, y: 350, z: -150 }
      }
    });
    view.nearZ = 142;
    view.performanceAngle = 0.8;
    view.performanceScale = 0.75;
    view.update([source], 22, flat);
    const batch = mesh(view);
    const actual = new Matrix4();
    batch.getMatrixAt(0, actual);
    const expected = new Matrix4();
    performanceNoteMatrix(
      expected,
      42,
      34 + (flat ? 0 : noteSlabHeight(20, 34)) / 2,
      -231,
      34,
      142,
      0.8,
      0.75
    );
    actual.elements.forEach((value, index) => {
      expect(value).toBeCloseTo(expected.elements[index] ?? 0);
    });
    const contact = batch.geometry.getAttribute("noteContact");
    const projection = batch.geometry.getAttribute("noteProjection");
    const shape = batch.geometry.getAttribute("labelShape");
    expect([contact.getX(0), contact.getY(0), contact.getZ(0), contact.getW(0)]).toEqual([
      34, 180, -90, 350
    ]);
    expect(projection.getX(0)).toBeCloseTo(1.4);
    expect(projection.getY(0)).toBeCloseTo(0.1);
    expect(projection.getZ(0)).toBeCloseTo(0.2);
    expect(projection.getW(0)).toBe(231);
    expect(shape.getW(0)).toBeCloseTo(flat ? 0 : noteSlabHeight(20, 34));
    expect(shape.getX(0)).toBe(20);
    expect(shape.getY(0)).toBe(178);
    expect(batch.material.vertexShader).toContain(NOTE_LANE_SHADER);
    expect(batch.material.uniforms.roadDockTransform).toBe(roadWidthUniforms.roadDockTransform);
    expect(batch.material.uniforms.roadFree).toBe(roadWidthUniforms.roadFree);
    expect(batch.material.depthTest).toBe(true);
    expect(batch.material.depthWrite).toBe(false);
    expect(batch.renderOrder).toBeGreaterThan(7);
    view.dispose();
  });

  it("bounds batch capacity and input count, and drops invalid and hidden notes", () => {
    const view = new ThreeRoadNoteLabels(2, canvasFixture().create);
    const batch = mesh(view);
    view.update([note(), note(), note()], 22);
    expect(batch.count).toBe(4);
    view.update([note(), note()], 22, false, 1);
    expect(batch.count).toBe(2);
    view.update([note(), note()], 22, false, 0);
    expect(batch.count).toBe(0);
    for (const changes of [
      { alpha: 0 },
      { top: 142 },
      { width: -1 },
      { x: NaN },
      { bottom: Infinity }
    ]) {
      view.update([note(changes)], 22);
      expect(batch.count).toBe(0);
    }
    view.update([note()], NaN);
    expect(batch.count).toBe(0);
    expect(batch.instanceMatrix.count).toBe(4);
    view.dispose();
    const maximum = new ThreeRoadNoteLabels(Infinity, canvasFixture(false).create);
    expect(maximum.capacity).toBe(NATIVE_NOTE_LABEL_CAPACITY);
    maximum.dispose();
  });

  it("disposes only owned GPU resources once and rejects later updates", () => {
    const view = new ThreeRoadNoteLabels(2, canvasFixture().create);
    const parent = new Group();
    const sibling = new Group();
    parent.add(view.group, sibling);
    const batch = mesh(view);
    const texture: unknown = batch.material.uniforms.picture?.value;
    if (!(texture instanceof Texture)) throw new Error("Expected baked atlas");
    const disposals = [
      vi.spyOn(texture, "dispose"),
      vi.spyOn(batch, "dispose"),
      vi.spyOn(batch.geometry, "dispose"),
      vi.spyOn(batch.material, "dispose")
    ];
    view.update([note()], 22);
    view.dispose();
    view.dispose();
    view.update([note()], 22);
    expect(view.ready).toBe(false);
    expect(batch.count).toBe(0);
    expect(view.group.children).toHaveLength(0);
    expect(parent.children).toEqual([sibling]);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
