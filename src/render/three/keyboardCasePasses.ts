import { Line, Mesh, Points, Sprite } from "three";
import type { Camera, Material, Object3D, Scene, WebGLRenderer } from "three";

type Role = "case" | "road" | "keys" | "environment" | "effects";
interface Part {
  readonly object: Object3D;
  readonly role: Role;
  visible: boolean;
}
interface Finish {
  readonly material: Material;
  colorWrite: boolean;
}

/** Membership changes only on layout/attachment; frame passes reuse these fixed buffers. */
class KeyboardCasePasses {
  private readonly parts: Part[] = [];
  private readonly finishes: Finish[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly road: Object3D,
    private readonly keys: Object3D,
    private readonly body: Object3D
  ) {
    const materials = new Set<Material>();
    scene.traverse((object) => {
      if (!(
        object instanceof Mesh ||
        object instanceof Line ||
        object instanceof Points ||
        object instanceof Sprite
      ))
        return;
      let role: Role = "environment";
      let parent: Object3D | null = object;
      while (parent) {
        if (parent === body) {
          role = "case";
          break;
        }
        if (parent === road) {
          role = "road";
          break;
        }
        if (parent === keys) {
          role = "keys";
          break;
        }
        parent = parent.parent;
      }
      const finishes = (
        Array.isArray(object.material) ? object.material : [object.material]
      ) as Material[];
      if (role === "environment" && finishes.some((material) => material.transparent))
        role = "effects";
      this.parts.push({ object, role, visible: object.visible });
      if (role === "case" || role === "environment")
        for (const material of finishes) materials.add(material);
    });
    for (const material of materials)
      this.finishes.push({ material, colorWrite: material.colorWrite });
  }

  private phase(role: Role, environment = false, effects = false): void {
    for (const part of this.parts)
      part.object.visible =
        part.visible &&
        (part.role === role ||
          (environment && part.role === "environment") ||
          (effects && part.role === "effects"));
  }

  draw(
    renderer: Pick<WebGLRenderer, "render" | "clearDepth">,
    roadCamera: Camera,
    keyboardCamera: Camera
  ): void {
    for (const part of this.parts) part.visible = part.object.visible;
    for (const finish of this.finishes) finish.colorWrite = finish.material.colorWrite;
    const roadVisible = this.road.visible,
      keysVisible = this.keys.visible,
      bodyVisible = this.body.visible;
    try {
      this.road.visible = false;
      this.phase("case", true);
      renderer.render(this.scene, keyboardCamera);
      this.phase("road");
      this.road.visible = roadVisible;
      this.keys.visible = false;
      renderer.clearDepth();
      renderer.render(this.scene, roadCamera);
      this.road.visible = false;
      this.keys.visible = keysVisible;
      this.phase("case", true);
      for (const finish of this.finishes) finish.material.colorWrite = false;
      // The physical case can occlude hands and the body without recolouring the road.
      renderer.clearDepth();
      renderer.render(this.scene, keyboardCamera);
      for (const finish of this.finishes) finish.material.colorWrite = finish.colorWrite;
      this.phase("keys", false, true);
      this.body.visible = false;
      renderer.render(this.scene, keyboardCamera);
    } finally {
      for (const part of this.parts) part.object.visible = part.visible;
      for (const finish of this.finishes) finish.material.colorWrite = finish.colorWrite;
      this.road.visible = roadVisible;
      this.keys.visible = keysVisible;
      this.body.visible = bodyVisible;
    }
  }
}

const passes = new WeakMap<Scene, KeyboardCasePasses>();

export function invalidateKeyboardCasePasses(scene: Scene): void {
  passes.delete(scene);
}

/** Background case, road, case depth, keys/hands: all eight scene meshes stay intact. */
export function drawKeyboardCasePasses(
  renderer: Pick<WebGLRenderer, "render" | "clearDepth">,
  scene: Scene,
  road: Object3D,
  keys: Object3D,
  body: Object3D,
  roadCamera: Camera,
  keyboardCamera: Camera
): void {
  let compositor = passes.get(scene);
  if (!compositor) {
    compositor = new KeyboardCasePasses(scene, road, keys, body);
    passes.set(scene, compositor);
  }
  compositor.draw(renderer, roadCamera, keyboardCamera);
}
