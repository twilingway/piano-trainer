import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PianoCase } from "./PianoCase";
import { KIT_TOP } from "./pianoKit";

function setup(left = -600, right = 600, metres = 1000) {
  const shell = new MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.3 });
  const cabinet = new PianoCase(shell);
  cabinet.layout(left, right, metres);
  cabinet.group.updateMatrixWorld(true);
  const mesh = (name: string) => {
    const object = cabinet.group.getObjectByName(name);
    if (!(object instanceof Mesh)) throw new Error(`Missing ${name}`);
    return object as Mesh;
  };
  return { cabinet, shell, mesh };
}

describe("digital piano housing and stand", () => {
  it("closes the rear and underside with opaque outward faces, without covering note lanes or key travel", () => {
    const v = setup();
    const rear = new Box3().setFromObject(v.mesh("case-rear"));
    const bottom = new Box3().setFromObject(v.mesh("case-bottom"));
    expect(rear.max.y).toBeLessThan(KIT_TOP);
    expect(rear.min.z).toBeCloseTo(-144.5, 3);
    expect(rear.max.z).toBeCloseTo(-142.5, 3);
    expect(bottom.min.z).toBeCloseTo(-142, 3);
    expect(bottom.max.z).toBeCloseTo(0, 3);
    for (const side of ["left", "right"]) {
      const edge = new Box3().setFromObject(v.mesh(`case-${side}-edge`));
      expect(edge.min.z).toBeCloseTo(-142, 3);
      expect(edge.max.z).toBeCloseTo(0, 3);
    }
    expect(bottom.max.y).toBeLessThan(-9);
    const ray = new Raycaster();
    ray.set(new Vector3(0, 0, -500), new Vector3(0, 0, 1));
    expect(ray.intersectObject(v.cabinet.group, true)[0]?.object.name).toBe("case-rear");
    ray.set(new Vector3(0, -250, -25), new Vector3(0, 1, 0));
    expect(ray.intersectObject(v.cabinet.group, true)[0]?.object.name).toBe("case-bottom");

    for (const object of v.cabinet.group.children) {
      if (!(object instanceof Mesh)) continue;
      const mesh = object as Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      expect(materials.every((material) => !material.transparent && material.depthWrite)).toBe(
        true
      );
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      const index = mesh.geometry.getIndex();
      const count = index?.count ?? positions.count;
      for (let i = 0; i < count; i += 3) {
        const a = index?.getX(i) ?? i,
          b = index?.getX(i + 1) ?? i + 1,
          c = index?.getX(i + 2) ?? i + 2;
        const start = new Vector3().fromBufferAttribute(positions, a);
        const ab = new Vector3().fromBufferAttribute(positions, b).sub(start);
        const ac = new Vector3().fromBufferAttribute(positions, c).sub(start);
        const face = ab.cross(ac);
        if (face.lengthSq() < 1e-10) continue;
        const normal = new Vector3().fromBufferAttribute(normals, a);
        expect(face.dot(normal)).toBeGreaterThan(0);
      }
    }
    v.cabinet.dispose();
    v.shell.dispose();
  });

  it.each([
    [-600, 600, 1000],
    [-150, 150, 936]
  ])(
    "supports the full %j..%j range and leaves the centre open to the player's legs and pedal",
    (left, right, metres) => {
      const v = setup(left, right, metres);
      const floor = KIT_TOP - 740;
      for (const side of ["left", "right"]) {
        const foot = new Box3().setFromObject(v.mesh(`stand-${side}-foot`));
        const panel = new Box3().setFromObject(v.mesh(`stand-${side}-panel`));
        expect(foot.min.y).toBeCloseTo(floor, 3);
        expect(panel.min.y).toBeCloseTo(foot.max.y, 3);
        expect(panel.max.y).toBeCloseTo(-15.5, 3);
        expect(foot.min.z).toBeGreaterThanOrEqual(-142.001);
        expect(foot.max.z).toBeLessThanOrEqual(0.001);
        expect(panel.min.z).toBeGreaterThanOrEqual(-142.001);
        expect(panel.max.z).toBeLessThanOrEqual(0.001);
      }
      for (const object of v.cabinet.group.children) {
        const bounds = new Box3().setFromObject(object);
        if (object.name.startsWith("stand-")) {
          expect(bounds.min.z).toBeGreaterThanOrEqual(-142.001);
          expect(bounds.max.z).toBeLessThanOrEqual(0.001);
        }
        expect(bounds.min.x).toBeGreaterThanOrEqual(left - 0.034 * metres - 0.001);
        expect(bounds.max.x).toBeLessThanOrEqual(right + 0.034 * metres + 0.001);
      }
      const ray = new Raycaster(new Vector3(0, floor + 350, 500), new Vector3(0, 0, -1));
      expect(ray.intersectObject(v.cabinet.group, true)).toHaveLength(0);
      v.cabinet.dispose();
      v.shell.dispose();
    }
  );

  it("rebuilds without leaking geometry and never disposes the caller's shared shell material", () => {
    const v = setup();
    const old = v.cabinet.group.children.filter((object): object is Mesh => object instanceof Mesh);
    const geometryDisposals = old.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    const shellDisposal = vi.spyOn(v.shell, "dispose");
    v.cabinet.layout(-300, 300, 936);
    expect(geometryDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(v.cabinet.group.children).toHaveLength(11);
    const fresh = v.cabinet.group.children.filter(
      (object): object is Mesh => object instanceof Mesh
    );
    const freshDisposals = fresh.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    const hardware = v.mesh("stand-left-foot").material;
    if (Array.isArray(hardware)) throw new Error("Expected one hardware material");
    const hardwareDisposal = vi.spyOn(hardware, "dispose");
    v.cabinet.dispose();
    v.cabinet.dispose();
    expect(freshDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(hardwareDisposal).toHaveBeenCalledOnce();
    expect(shellDisposal).not.toHaveBeenCalled();
    expect(v.cabinet.group.children).toHaveLength(0);
    v.cabinet.layout(-300, 300, 936);
    expect(v.cabinet.group.children).toHaveLength(0);
    v.shell.dispose();
  });
});

it("leaves at least 3 mm below the actual white-key geometry at full dip", async () => {
  const data = new Uint8Array(readFileSync("public/models/piano-kit.glb")).buffer;
  const model = await new GLTFLoader().parseAsync(data, "");
  const key = model.scene.getObjectByName("white-full");
  if (!(key instanceof Mesh)) throw new Error("Missing white key");
  const positions = (key as Mesh).geometry.getAttribute("position");
  const pivot = (250 * 142) / 150;
  const angle = Math.asin(9 / pivot);
  let minimum = Infinity;
  let front = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const y = KIT_TOP + positions.getY(i) * 1000;
    const z = positions.getZ(i) * ((1000 * 142) / 150) + pivot;
    minimum = Math.min(minimum, y * Math.cos(angle) - z * Math.sin(angle));
    front = Math.max(front, z * Math.cos(angle) + y * Math.sin(angle) - pivot);
  }
  const v = setup();
  const roof = new Box3().setFromObject(v.mesh("case-bottom")).max.y;
  expect(minimum - roof).toBeGreaterThanOrEqual(3);
  expect(roof).toBeCloseTo(-12.5, 3);
  const frontWall = new Box3().setFromObject(v.mesh("case-front-edge"));
  expect(frontWall.min.z - front).toBeGreaterThan(0.5);
  expect(frontWall.max.z).toBeCloseTo(2.5, 3);
  v.cabinet.dispose();
  v.shell.dispose();
  model.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      material.dispose();
  });
});
