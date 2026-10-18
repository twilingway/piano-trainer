import { existsSync, readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Bone,
  AnimationMixer,
  Raycaster,
  BufferAttribute,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderLib,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3
} from "three";
import type { BufferGeometry, Material, WebGLRenderer } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PianistFace } from "./PianistFace";
import { performerExpression } from "./performerExpression";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup.length = 0;
  vi.restoreAllMocks();
});
function fixture() {
  const scene = new Group(),
    head = new Bone();
  head.name = "head";
  head.position.y = 2;
  scene.add(head);
  const white = new MeshStandardMaterial({ color: 0xffffff }),
    blue = new MeshStandardMaterial({ color: 0x286cbb });
  const black = new MeshStandardMaterial({ color: 0x111111 }),
    skin = new MeshStandardMaterial({ color: 0x92563c, roughness: 0.7 });
  const originals: SkinnedMesh[] = [],
    irisRoots: Group[] = [];
  const add = (geometry: BufferGeometry, material: Material, parent: Group) => {
    const mesh = new SkinnedMesh(geometry, material),
      count = geometry.getAttribute("position").count;
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    parent.add(mesh);
    scene.updateMatrixWorld(true);
    mesh.bind(new Skeleton([head]));
    originals.push(mesh);
    return mesh;
  };
  for (const side of [1, -1]) {
    const eye = new Group(),
      iris = new Group(),
      lid = new Group();
    eye.name = "Eye_" + String(side);
    iris.name = "Iris_" + String(side);
    lid.name = "Personal_Eyelid_" + String(side);
    scene.add(eye, iris, lid);
    irisRoots.push(iris);
    const x = side * 0.035;
    add(new SphereGeometry(0.02, 20, 14).translate(x, 2, 0.1), white, eye);
    add(new CircleGeometry(0.008, 20).translate(x, 2, 0.1204), blue, iris);
    add(new CircleGeometry(0.003, 20).translate(x, 2, 0.1205), black, iris);
    add(new CircleGeometry(0.022, 20).translate(x, 2, 0.119), skin, lid);
  }
  scene.updateMatrixWorld(true);
  cleanup.push(() => {
    for (const mesh of originals) mesh.geometry.dispose();
    for (const mat of [white, blue, black, skin]) mat.dispose();
  });
  return { scene, head, originals, irisRoots, skin };
}
function faceParts(face: PianistFace) {
  const irises = face.group.children.filter((node) => node.name.startsWith("PianistIris"));
  const caps = face.group.children.filter(
    (node): node is Mesh => node instanceof Mesh && node.name.startsWith("PianistBlink")
  );
  return { irises, caps };
}
function activeBlink(): number {
  let best = 0,
    time = 0;
  for (let t = 0; t < 10; t += 0.001) {
    const blink = performerExpression(t).blink;
    if (blink > best) {
      best = blink;
      time = t;
    }
  }
  expect(best).toBeGreaterThan(0.999);
  return time;
}

describe("reversible posed eye copies", () => {
  it("bakes every iris submesh once, shares its material and leaves skeleton/white/ring unchanged", () => {
    const v = fixture();
    v.scene.scale.setScalar(936);
    const original = v.originals.map((mesh) => ({
      positions: Array.from(mesh.geometry.getAttribute("position").array),
      weights: Array.from(mesh.geometry.getAttribute("skinWeight").array),
      parent: mesh.parent
    }));
    const bone = {
      position: v.head.position.toArray(),
      turn: v.head.quaternion.toArray(),
      scale: v.head.scale.toArray(),
      parent: v.head.parent
    };
    const face = PianistFace.create(v.scene);
    expect(face).toBeDefined();
    if (!face) throw Error("No face");
    cleanup.push(() => {
      face.dispose();
    });
    const { irises, caps } = faceParts(face);
    expect(irises).toHaveLength(2);
    expect(caps).toHaveLength(2);
    expect(irises.map((iris) => iris.children.length)).toEqual([2, 2]);
    expect(face.group.parent).toBe(v.head);
    for (const [index, mesh] of v.originals.entries()) {
      expect(Array.from(mesh.geometry.getAttribute("position").array)).toEqual(
        original[index]?.positions
      );
      expect(Array.from(mesh.geometry.getAttribute("skinWeight").array)).toEqual(
        original[index]?.weights
      );
      expect(mesh.parent).toBe(original[index]?.parent);
      if (mesh.parent?.name.startsWith("Eye_") || mesh.parent?.name.startsWith("Personal_Eyelid"))
        expect(mesh.parent.visible).toBe(true);
    }
    for (const iris of irises)
      for (const copy of iris.children) {
        if (!(copy instanceof Mesh)) throw Error("Missing iris copy");
        expect((copy as Mesh).geometry.attributes.skinIndex).toBeUndefined();
        expect((copy as Mesh).geometry.attributes.skinWeight).toBeUndefined();
        expect(v.originals.some((source) => source.material === copy.material)).toBe(true);
      }
    expect(v.head.position.toArray()).toEqual(bone.position);
    expect(v.head.quaternion.toArray()).toEqual(bone.turn);
    expect(v.head.scale.toArray()).toEqual(bone.scale);
    expect(v.head.parent).toBe(bone.parent);
    expect(v.irisRoots.every((root) => !root.visible)).toBe(true);
  });

  it("follows skeletal head motion without double skinning and repeats after seek", () => {
    const v = fixture(),
      face = PianistFace.create(v.scene);
    if (!face) throw Error("No face");
    cleanup.push(() => {
      face.dispose();
    });
    face.update(3.25);
    const { irises } = faceParts(face),
      poses = irises.map((iris) => iris.quaternion.toArray());
    const geometry = (irises[0]?.children[0] as Mesh).geometry,
      attribute = geometry.getAttribute("position");
    if (!(attribute instanceof BufferAttribute)) throw new Error("Missing baked vertex buffer");
    const version = attribute.version;
    v.head.rotation.set(0.25, 0.4, -0.15);
    const headTurn = v.head.quaternion.clone();
    v.scene.updateMatrixWorld(true);
    face.update(100);
    face.update(3.25);
    v.scene.updateMatrixWorld(true);
    expect(irises.map((iris) => iris.quaternion.toArray())).toEqual(poses);
    expect(v.head.quaternion.equals(headTurn)).toBe(true);
    expect(attribute.version).toBe(version);
    for (const iris of irises)
      expect(iris.quaternion.angleTo(new Quaternion())).toBeLessThan((2.5 * Math.PI) / 180);
    const node = irises[0];
    if (!node) throw Error("Missing iris");
    expect(
      node.getWorldPosition(new Vector3()).distanceTo(v.head.localToWorld(node.position.clone()))
    ).toBeLessThan(1e-10);
  });

  it("uses outward finite cap geometry and a skin-cloned shader threshold rather than squashing eyes", () => {
    const v = fixture(),
      face = PianistFace.create(v.scene);
    if (!face) throw Error("No face");
    cleanup.push(() => {
      face.dispose();
    });
    const { caps } = faceParts(face);
    face.update(-1);
    expect(caps.every((cap) => !cap.visible)).toBe(true);
    face.update(activeBlink());
    expect(caps.every((cap) => cap.visible)).toBe(true);
    for (const cap of caps) {
      expect(cap.material).not.toBe(v.skin);
      const material = cap.material as Material;
      const shader = {
        uniforms: {},
        vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader
      } as Parameters<Material["onBeforeCompile"]>[0];
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.fragmentShader).toContain("vFaceLidY < 1.0 - 2.0 * faceBlink");
      expect(shader.vertexShader).toContain("vFaceLidY = faceLidY");
      expect(shader.uniforms.faceBlink?.value).toBeGreaterThan(0.999);
      const geometry = cap.geometry,
        position = geometry.getAttribute("position"),
        normals = geometry.getAttribute("normal"),
        height = geometry.getAttribute("faceLidY");
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Math.min(...Array.from(height.array))).toBe(-1);
      expect(Math.max(...Array.from(height.array))).toBe(1);
      const centre = geometry.boundingBox?.getCenter(new Vector3());
      if (!centre) throw Error("No cap bounds");
      for (let index = 0; index < position.count; index++) {
        const point = new Vector3().fromBufferAttribute(position, index).sub(centre),
          normal = new Vector3().fromBufferAttribute(normals, index);
        if (normal.length() > 0.1) expect(point.dot(normal)).toBeGreaterThan(-0.001);
      }
    }
  });

  it("disposes owned resources once and restores the exact original visibility", () => {
    const v = fixture();
    if (v.irisRoots[1]) v.irisRoots[1].visible = false;
    const face = PianistFace.create(v.scene);
    if (!face) throw Error("No face");
    const { irises, caps } = faceParts(face);
    expect(irises[1]?.visible).toBe(false);
    const ownGeometry = caps
      .map((cap) => cap.geometry)
      .concat(irises.flatMap((iris) => iris.children.map((node) => (node as Mesh).geometry)));
    const geometrySpies = ownGeometry.map((geometry) => vi.spyOn(geometry, "dispose"));
    const ownMaterial = vi.spyOn(caps[0]?.material as Material, "dispose"),
      shared = vi.spyOn(v.skin, "dispose");
    const sourceSpies = v.originals.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    face.dispose();
    face.dispose();
    face.update(4);
    expect(face.group.parent).toBeNull();
    expect(face.group.children).toHaveLength(0);
    for (const dispose of geometrySpies) expect(dispose).toHaveBeenCalledOnce();
    expect(ownMaterial).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled();
    expect(sourceSpies.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);
    expect(v.irisRoots.map((iris) => iris.visible)).toEqual([true, false]);
  });

  it("keeps unknown or partly supported models intact", () => {
    expect(PianistFace.create(new Group())).toBeUndefined();
    const v = fixture(),
      missing = v.scene.getObjectByName("Iris_-1");
    missing?.removeFromParent();
    const count = v.head.children.length;
    expect(PianistFace.create(v.scene)).toBeUndefined();
    expect(v.irisRoots[0]?.visible).toBe(true);
    expect(v.head.children).toHaveLength(count);
  });
});

it.skipIf(!existsSync("local-models/pianist.glb"))(
  "covers the real posed iris with closed caps without editing private skin",
  async () => {
    const glb = readFileSync("local-models/pianist.glb"),
      length = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + length).toString()) as Record<string, unknown>;
    delete json.images;
    delete json.textures;
    delete json.samplers;
    json.materials = (json.materials as object[]).map(() => ({ doubleSided: true }));
    json.extensionsUsed = [];
    json.extensionsRequired = [];
    let text = JSON.stringify(json);
    while (Buffer.byteLength(text) % 4) text += " ";
    const encoded = Buffer.from(text),
      header = Buffer.from(glb.subarray(0, 20)),
      bin = glb.subarray(20 + length);
    header.writeUInt32LE(20 + encoded.length + bin.length, 8);
    header.writeUInt32LE(encoded.length, 12);
    const model = await new GLTFLoader().parseAsync(
      new Uint8Array(Buffer.concat([header, encoded, bin])).buffer,
      ""
    );
    const clip = model.animations[0];
    if (clip) {
      const mixer = new AnimationMixer(model.scene);
      mixer.clipAction(clip).play();
      mixer.setTime(0);
    }
    model.scene.scale.setScalar(936);
    model.scene.updateMatrixWorld(true);
    const face = PianistFace.create(model.scene);
    if (!face) throw new Error("Actual face unsupported");
    cleanup.push(() => {
      face.dispose();
    });
    face.update(activeBlink());
    const head = model.scene.getObjectByName("head");
    if (!(head instanceof Bone)) throw new Error("No actual head");
    const { irises, caps } = faceParts(face);
    expect(irises).toHaveLength(2);
    expect(caps.every((cap) => cap.visible)).toBe(true);
    let checked = 0;
    for (const iris of irises) {
      const cap = face.group.getObjectByName(iris.name.replace("Iris", "Blink"));
      if (!(cap instanceof Mesh)) throw new Error("No actual lid cap");
      for (const child of iris.children) {
        const mesh = child as Mesh,
          position = mesh.geometry.getAttribute("position");
        for (let index = 0; index < position.count; index += 7) {
          const local = new Vector3()
            .fromBufferAttribute(position, index)
            .applyQuaternion(iris.quaternion)
            .add(iris.position);
          const outward = local.clone().sub(iris.position),
            origin = iris.position.clone().addScaledVector(outward, 4);
          const worldOrigin = head.localToWorld(origin),
            worldTarget = head.localToWorld(local);
          model.scene.updateMatrixWorld(true);
          const ray = new Raycaster(worldOrigin, worldTarget.clone().sub(worldOrigin).normalize());
          const hits = ray.intersectObjects([cap, mesh], false);
          expect(hits[0]?.object).toBe(cap);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  }
);
