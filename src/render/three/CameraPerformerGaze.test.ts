import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  AnimationMixer,
  Bone,
  BufferAttribute,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3
} from "three";
import type { BufferGeometry, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it } from "vitest";
import { CameraPerformerGaze } from "./CameraPerformerGaze";
import type { GazeBasis } from "./gazeMath";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup.length = 0;
});
function fixture(baked = false, irisPivots = false) {
  const model = new Group(),
    neck = new Bone(),
    head = new Bone(),
    material = new MeshBasicMaterial();
  neck.name = baked ? "neck01" : "Neck";
  head.name = baked ? "head" : "Head";
  neck.position.y = 1.6;
  head.position.y = 0.4;
  neck.add(head);
  model.add(neck);
  const eyes: Object3D[] = [],
    geometries: BufferGeometry[] = [];
  model.updateMatrixWorld(true);
  const addSkin = (geometry: BufferGeometry, parent: Group) => {
    const count = geometry.getAttribute("position").count,
      weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    const mesh = new SkinnedMesh(geometry, material);
    parent.add(mesh);
    model.updateMatrixWorld(true);
    mesh.bind(new Skeleton([head]));
    geometries.push(geometry);
  };
  for (const side of [1, -1]) {
    const x = side * 0.035;
    if (baked) {
      const eye = new Group(),
        iris = new Group();
      eye.name = "Eye_" + String(side);
      iris.name = "Iris_" + String(side);
      model.add(eye, iris);
      addSkin(new SphereGeometry(0.02, 16, 10).translate(x, 2.04, -0.08), eye);
      addSkin(new CircleGeometry(0.008, 16).rotateY(Math.PI).translate(x, 2.04, -0.1005), iris);
      if (irisPivots) {
        const pivot = new Group();
        pivot.name = "PianistIris_" + String(side);
        pivot.position.set(x, 0.04, -0.08);
        head.add(pivot);
        eyes.push(pivot);
      }
    } else {
      const geometry = new SphereGeometry(0.02, 16, 10),
        eye = new Mesh(geometry, material);
      geometries.push(geometry);
      eye.name = "GEO-body_male_realistic.eye." + (side === 1 ? "L" : "R");
      eye.position.set(x, 0.04, -0.08);
      head.add(eye);
      eyes.push(eye);
    }
  }
  model.rotation.set(0.15, 0.8, -0.12);
  model.scale.setScalar(3);
  neck.rotation.z = 0.03;
  head.rotation.x = 0.08;
  model.updateMatrixWorld(true);
  cleanup.push(() => {
    for (const geometry of geometries) geometry.dispose();
    material.dispose();
  });
  return { model, neck, head, eyes };
}
function target(face: GazeBasis, x = 0.3, y = 0.1): Vector3 {
  const forward = new Vector3().copy(face.forward),
    up = new Vector3().copy(face.up),
    right = forward.clone().cross(up).normalize();
  return new Vector3()
    .copy(face.origin)
    .addScaledVector(forward, 10)
    .addScaledVector(right, 10 * x)
    .addScaledVector(up, 10 * y);
}
function basis(controller: CameraPerformerGaze): GazeBasis {
  const face = controller.getFaceBasis();
  if (!face) throw new Error("No calibrated face");
  return face;
}
function attributes(model: Object3D): string {
  const hash = createHash("sha256");
  model.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const name of ["position", "skinWeight", "skinIndex"]) {
      const mesh = node as Mesh;
      const attribute = mesh.geometry.getAttribute(name);
      if (attribute instanceof BufferAttribute)
        hash.update(
          Buffer.from(
            attribute.array.buffer,
            attribute.array.byteOffset,
            attribute.array.byteLength
          )
        );
    }
  });
  return hash.digest("hex");
}

describe("bounded additive performer gaze", () => {
  it("derives rotated MPFB eye geometry and preserves translations, scales, parents and attributes", () => {
    const v = fixture(),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    expect(controller.available).toBe(true);
    expect(controller.controlledEyeCount).toBe(2);
    const original = [v.head, v.neck, ...v.eyes].map((node) => ({
        node,
        position: node.position.clone(),
        scale: node.scale.clone(),
        parent: node.parent
      })),
      hash = attributes(v.model),
      face = basis(controller),
      camera = target(face, 0.5, 0.3);
    const gaze = controller.apply(camera, 68, 1),
      turned = basis(controller),
      forward = new Vector3().copy(face.forward),
      right = forward.clone().cross(new Vector3().copy(face.up)).normalize(),
      actual = new Vector3().copy(turned.forward);
    expect(
      actual.dot(camera.clone().sub(new Vector3().copy(turned.origin)).normalize())
    ).toBeGreaterThan(forward.dot(camera.clone().sub(new Vector3().copy(face.origin)).normalize()));
    expect(Math.atan2(actual.dot(right), actual.dot(forward))).toBeGreaterThan(0);
    expect(gaze.headYaw).toBeLessThan((25 * Math.PI) / 180);
    expect(gaze.headPitch).toBeLessThan((12 * Math.PI) / 180);
    expect(Math.abs(gaze.eyeYaw)).toBeLessThan((8 * Math.PI) / 180);
    expect(v.eyes.every((eye) => eye.quaternion.angleTo(new Quaternion()) > 0)).toBe(true);
    for (const saved of original) {
      expect(saved.node.position).toEqual(saved.position);
      expect(saved.node.scale).toEqual(saved.scale);
      expect(saved.node.parent).toBe(saved.parent);
    }
    expect(attributes(v.model)).toBe(hash);
  });
  it("reuses centered iris copies and leaves raw baked/skinned eye roots intact", () => {
    const v = fixture(true, true),
      raw = v.model.getObjectByName("Eye_1"),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    expect(controller.controlledEyeCount).toBe(2);
    const hash = attributes(v.model),
      face = basis(controller),
      rawQuaternion = raw?.quaternion.clone();
    controller.apply(target(face, 0.4, 0.15), 60, 1);
    expect(raw?.quaternion.toArray()).toEqual(rawQuaternion?.toArray());
    expect(attributes(v.model)).toBe(hash);
    expect(v.eyes.every((eye) => eye.quaternion.angleTo(new Quaternion()) > 0)).toBe(true);
  });
  it("does not rotate unsafe baked eye pivots when the expression helper is absent", () => {
    const v = fixture(true),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    expect(controller.available).toBe(true);
    expect(controller.controlledEyeCount).toBe(0);
    const head = v.head.quaternion.clone(),
      eye = v.model.getObjectByName("Eye_1")?.quaternion.clone();
    controller.apply(target(basis(controller)), 60, 1);
    expect(v.head.quaternion.angleTo(head)).toBeGreaterThan(0);
    expect(v.model.getObjectByName("Eye_1")?.quaternion.toArray()).toEqual(eye?.toArray());
  });
  it("never accumulates on pause or arbitrary seek order and accepts a fresh native base pose", () => {
    const v = fixture(),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    const initialHead = v.head.quaternion.clone(),
      initialNeck = v.neck.quaternion.clone(),
      face = basis(controller),
      camera = target(face, 0.3, 0.1);
    controller.apply(camera, 60, 1);
    const wanted = v.head.quaternion.clone(),
      neckWanted = v.neck.quaternion.clone();
    for (const time of [60, 60, 2, 154, 20, 60]) {
      controller.apply(camera, time, 1);
      expect(v.head.quaternion.angleTo(wanted)).toBeLessThan(1e-6);
      expect(v.neck.quaternion.angleTo(neckWanted)).toBeLessThan(1e-6);
    }
    controller.prepare();
    expect(v.head.quaternion.angleTo(initialHead)).toBeLessThan(1e-6);
    expect(v.neck.quaternion.angleTo(initialNeck)).toBeLessThan(1e-6);
    const fresh = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.16);
    v.head.quaternion.copy(fresh);
    controller.apply(camera, 70, 1);
    controller.prepare();
    expect(v.head.quaternion.angleTo(fresh)).toBeLessThan(1e-6);
    controller.apply(camera, 70, 1);
    const newer = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.09);
    v.head.quaternion.copy(newer);
    controller.apply(camera, 71, 1);
    controller.dispose();
    expect(v.head.quaternion.angleTo(newer)).toBeLessThan(1e-6);
  });
  it("relinquishes a rear camera and keeps the final front18degree view natural", () => {
    const v = fixture(),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    const base = v.head.quaternion.clone(),
      face = basis(controller);
    const gaze = controller.apply(target(face, Math.tan((18 * Math.PI) / 180), 0.08), 149, 1);
    expect(gaze.weight).toBe(1);
    expect(gaze.headYaw).toBeGreaterThan(0);
    expect(gaze.headYaw).toBeLessThan((25 * Math.PI) / 180);
    const behind = new Vector3()
      .copy(face.origin)
      .addScaledVector(new Vector3().copy(face.forward), -10);
    expect(controller.apply(behind, 150, 1).weight).toBe(0);
    expect(v.head.quaternion.angleTo(base)).toBeLessThan(1e-6);
    expect(controller.apply(target(face), 149, 0).weight).toBe(0);
    expect(v.head.quaternion.angleTo(base)).toBeLessThan(1e-6);
  });
  it("calibrates actual forward despite different model and head coordinate frames", () => {
    for (const baked of [false, true]) {
      const v = fixture(baked, true);
      v.head.rotation.set(0.34, -0.21, 0.18);
      v.neck.rotation.z = -0.12;
      v.model.updateMatrixWorld(true);
      const controller = new CameraPerformerGaze(v.model);
      cleanup.push(() => {
        controller.dispose();
      });
      const actual = new Vector3().copy(basis(controller).forward),
        expected = new Vector3(0, 0, -1).transformDirection(v.head.matrixWorld);
      expect(actual.dot(expected)).toBeGreaterThan(0.999);
    }
  });
  it("bounds the physical combined head/neck orientation and eye residual", () => {
    const v = fixture(),
      controller = new CameraPerformerGaze(v.model);
    cleanup.push(() => {
      controller.dispose();
    });
    const face = basis(controller),
      forward = new Vector3().copy(face.forward),
      up = new Vector3().copy(face.up),
      right = forward.clone().cross(up).normalize(),
      neck = v.neck.quaternion.clone();
    controller.apply(target(face, 1, 1), 68, 1);
    const turned = new Vector3().copy(basis(controller).forward);
    const yaw = Math.atan2(turned.dot(right), turned.dot(forward)),
      pitch = Math.asin(Math.max(-1, Math.min(1, turned.dot(up))));
    expect(Math.abs(yaw)).toBeLessThan((25 * Math.PI) / 180);
    expect(Math.abs(pitch)).toBeLessThan((12 * Math.PI) / 180);
    expect(v.neck.quaternion.angleTo(neck)).toBeLessThan((7 * Math.PI) / 180);
    for (const eye of v.eyes)
      expect(eye.quaternion.angleTo(new Quaternion())).toBeLessThan(
        (Math.sqrt(2) * 8 * Math.PI) / 180
      );
  });
  it("leaves unsupported models intact", () => {
    const model = new Group(),
      head = new Bone();
    head.name = "head";
    model.add(head);
    const controller = new CameraPerformerGaze(model);
    expect(controller.available).toBe(false);
    expect(controller.apply({ x: 1, y: 2, z: 3 }, 20, 1).weight).toBe(0);
    controller.dispose();
    expect(head.quaternion.toArray()).toEqual(new Quaternion().toArray());
  });
});

const privatePath = process.env.PIANIST_GAZE_TEST_GLB ?? "local-models/pianist.glb";
it.skipIf(!existsSync(privatePath))(
  "calibrates the private GLB from actual posed eyes without editing source attributes",
  async () => {
    const glb = readFileSync(privatePath),
      length = glb.readUInt32LE(12),
      json = JSON.parse(glb.subarray(20, 20 + length).toString()) as Record<string, unknown>;
    delete json.images;
    delete json.textures;
    delete json.samplers;
    json.materials = Array.isArray(json.materials)
      ? json.materials.map(() => ({ doubleSided: true }))
      : [];
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
      mixer.setTime(2.5);
    }
    model.scene.scale.setScalar(936);
    model.scene.updateMatrixWorld(true);
    const controller = new CameraPerformerGaze(model.scene);
    cleanup.push(() => {
      controller.dispose();
    });
    expect(controller.available).toBe(true);
    const hash = attributes(model.scene),
      face = basis(controller),
      camera = target(face, 0.25, 0.08),
      head = model.scene.getObjectByName("head");
    if (!head) throw new Error("No private head");
    const position = head.position.clone(),
      scale = head.scale.clone(),
      parent = head.parent,
      base = head.quaternion.clone(),
      output = controller.apply(camera, 149, 1);
    expect(output.weight).toBe(1);
    expect(head.quaternion.angleTo(base)).toBeGreaterThan(0);
    const held = head.quaternion.clone();
    for (const time of [149, 68, 149]) {
      controller.apply(camera, time, 1);
      expect(head.quaternion.angleTo(held)).toBeLessThan(1e-6);
    }
    expect(attributes(model.scene)).toBe(hash);
    expect(head.position).toEqual(position);
    expect(head.scale).toEqual(scale);
    expect(head.parent).toBe(parent);
    controller.dispose();
    expect(head.quaternion.toArray()).toEqual(base.toArray());
  }
);
