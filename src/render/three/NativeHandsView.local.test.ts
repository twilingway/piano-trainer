import { existsSync } from "node:fs";
import { Mesh, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { handGlb } from "./handScene.testSupport";
import { disposePianistModel } from "./disposePianistModel";
import { NativeHandsView } from "./NativeHandsView";

const privatePath = process.env.NATIVE_HANDS_TEST_GLB ?? "local-models/pianist-performance.glb";

it.skipIf(!existsSync(privatePath))(
  "keeps actual loaded native hands and every nail primitive while hiding the body",
  async () => {
    const { scene } = await new GLTFLoader().parseAsync(handGlb(privatePath), "");
    const candidate = scene.getObjectByName("PianistBody");
    if (!(candidate instanceof SkinnedMesh)) throw new Error("No native body mesh");
    const body = candidate as SkinnedMesh;
    const original = body.geometry,
      nails: Mesh[] = [],
      wardrobe: Mesh[] = [];
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      if (node.name.startsWith("AnatomicalNailSurface_")) nails.push(node as Mesh);
      if (/TopHat|Coat|PersonalHead|bench/.test(node.name)) wardrobe.push(node as Mesh);
    });
    expect(body.skeleton.bones.some((bone) => bone.name === "wristL")).toBe(true);
    expect(nails.length).toBeGreaterThan(10);
    expect(wardrobe.length).toBeGreaterThan(0);
    const view = new NativeHandsView(scene);
    try {
      view.showHands();
      expect(body.visible).toBe(true);
      expect(body.geometry).not.toBe(original);
      expect(body.geometry.index?.count).toBeGreaterThan(0);
      expect(body.geometry.index?.count).toBeLessThan(original.index?.count ?? Infinity);
      expect(nails.every((nail) => nail.visible)).toBe(true);
      expect(wardrobe.every((part) => !part.visible)).toBe(true);
      view.restore();
      expect(body.geometry).toBe(original);
      expect(wardrobe.every((part) => part.visible)).toBe(true);
    } finally {
      view.dispose();
      disposePianistModel(scene);
    }
  }
);
