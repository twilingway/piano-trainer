import type { BufferGeometry } from "three";
import {
  Box3,
  BufferAttribute,
  Camera,
  ColorManagement,
  DirectionalLight,
  ExternalTexture,
  Group,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import { WebGLRenderer } from "three";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { keyBoxes } from "./keyBoxes";
import type { KeyBox } from "./keyBoxes";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE, splitUp, whitePart } from "./pianoKit";
import type { KitPart, PianoKit } from "./pianoKit";
import { projectionMatrix, viewMatrix } from "./threeCamera";

// Pixi's colours and the keys' texture are display values: keep three in the same space.
ColorManagement.enabled = false;

/** How far a held key turns on its back hinge: its front edge sinks about 9 units. */
const DIP = (3.5 * Math.PI) / 180;
/** How fast a key follows the finger, per second. */
const DIP_RATE = 30;

interface Hinged {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
}

/** The keyboard drawn by three.js into Pixi's own WebGL context, on Pixi's camera. */
export class ThreeStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly keys = new Group();
  /** Pixi's picture of the flat keys: colours, lights and stickers for the top faces. */
  private readonly picture = new ExternalTexture();
  private readonly top = new MeshStandardMaterial({ map: this.picture, roughness: 0.55 });
  private readonly white = new MeshStandardMaterial({ color: 0xe4e1d8, roughness: 0.6 });
  private readonly black = new MeshStandardMaterial({ color: 0x1d2028, roughness: 0.4 });
  private readonly case = new MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.3 });
  private readonly felt = new MeshStandardMaterial({ color: 0x951f2c, roughness: 0.95 });
  private readonly table = new MeshStandardMaterial({ color: 0x343033, roughness: 0.45 });
  /** The case around the keys: rails, cheeks, the back panel and the table. */
  private readonly body = new Group();
  private readonly board: BufferGeometry;
  private hinged: Hinged[] = [];
  private version = -1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly context: WebGL2RenderingContext,
    private readonly kit: PianoKit
  ) {
    // The board's top is left out: the road runs there, drawn before the keys.
    this.board = splitUp(this.part("board").clone(), true);
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.camera.matrixAutoUpdate = false;
    const sun = new DirectionalLight(0xffffff, 2.4);
    // Above, in front of the keys and a little to the left: front faces lit, sides shaded.
    sun.position.set(-300, 900, 700);
    this.scene.add(new HemisphereLight(0xffffff, 0x3a3f4c, 1.8), sun, this.keys);
    this.keys.add(this.body);
  }

  /** Draws the keys over whatever is in the frame now, keeping it: the road under them. */
  draw(
    keys: KeysScene,
    picture: WebGLTexture,
    down: (pitch: number) => boolean,
    screen: { readonly width: number; readonly height: number },
    deltaSeconds: number
  ): void {
    if (keys.version !== this.version) this.build(keys);
    this.picture.sourceTexture = picture;
    const { params } = keys.camera;
    const scale = params.prefs.scale;
    this.keys.scale.setScalar(scale);
    this.keys.position.x = (-keys.pan / 2) * scale;
    const step = Math.min(1, deltaSeconds * DIP_RATE);
    for (const { pitch, hinge } of this.hinged) {
      const target = down(pitch) ? DIP : 0;
      hinge.rotation.x += (target - hinge.rotation.x) * step;
    }
    this.camera.matrix.copy(viewMatrix(params)).invert();
    this.camera.matrixWorldNeedsUpdate = true;
    this.camera.projectionMatrix.copy(
      projectionMatrix(params, screen.width, screen.height, keys.offset)
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.setViewport(
      0,
      0,
      this.context.drawingBufferWidth,
      this.context.drawingBufferHeight
    );
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    // Hand the context back as WebGL defaults: Pixi's own reset leaves depth testing on.
    this.renderer.resetState();
  }

  dispose(): void {
    this.clear();
    this.board.dispose();
    for (const material of [this.top, this.white, this.black, this.case, this.felt, this.table])
      material.dispose();
    this.renderer.dispose();
  }

  private build(keys: KeysScene): void {
    this.clear();
    this.version = keys.version;
    const boxes = keyBoxes(keys);
    const black = new Set(boxes.filter((box) => box.black).map((box) => box.pitch));
    for (const box of boxes) {
      const part = box.black
        ? "black"
        : whitePart(black.has(box.pitch - 1), black.has(box.pitch + 1));
      const geometry = keyGeometry(this.part(part), box);
      geometry.computeBoundingBox();
      const bottom = geometry.boundingBox?.min.y ?? 0;
      const mesh = new Mesh(geometry, [this.top, box.black ? this.black : this.white]);
      // The hinge sits on the key's back bottom edge; the key hangs forward from it.
      mesh.position.set(0, -bottom, box.back);
      const hinge = new Group();
      hinge.position.set(box.x, bottom, -box.back);
      hinge.add(mesh);
      this.keys.add(hinge);
      this.hinged.push({ pitch: box.pitch, hinge, mesh });
    }
    this.buildBody(boxes);
  }

  /** Rails, back panel and table across the range, a cheek at each end. */
  private buildBody(boxes: readonly KeyBox[]): void {
    const whites = boxes.filter((box) => !box.black);
    if (whites.length === 0) return;
    const left = Math.min(...whites.map((box) => box.x - box.width / 2));
    const right = Math.max(...whites.map((box) => box.x + box.width / 2));
    const across = (whites[0]?.width ?? 0) / KIT_WHITE;
    const cheek = 0.034 * across;
    const add = (
      geometry: BufferGeometry,
      material: MeshStandardMaterial,
      x: number,
      sx: number
    ) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, KIT_TOP, 0);
      mesh.scale.set(sx, 1000, KIT_DEPTH);
      this.body.add(mesh);
    };
    const width = right - left + 2 * cheek;
    const centre = (left + right) / 2;
    add(this.board, this.case, centre, width);
    add(this.part("felt"), this.felt, centre, right - left);
    add(this.part("slip"), this.case, centre, width);
    add(this.part("table"), this.table, centre, width + 4 * cheek);
    add(this.part("cheek"), this.case, left - cheek / 2, across);
    add(this.part("cheek"), this.case, right + cheek / 2, across);
  }

  private part(name: KitPart): BufferGeometry {
    const geometry = this.kit.get(name);
    if (!geometry) throw new Error(`piano kit has no part "${name}"`);
    return geometry;
  }

  private clear(): void {
    for (const { hinge, mesh } of this.hinged) {
      mesh.geometry.dispose();
      this.keys.remove(hinge);
    }
    this.hinged = [];
    // The case shares the kit's geometry: nothing of its own to free.
    this.body.clear();
  }
}

/**
 * The kit's key sized to the app's key: its width to the slot, millimetres up, 150 mm along to
 * 142; the top faces, group 0, show the key's rect of the picture.
 */
function keyGeometry(part: BufferGeometry, box: KeyBox): BufferGeometry {
  const geometry = part.clone();
  const { min, max } = new Box3().setFromBufferAttribute(
    geometry.getAttribute("position") as BufferAttribute
  );
  const across = box.black ? box.width / (max.x - min.x) : box.width / KIT_WHITE;
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  const { u0, u1, v0, v1 } = box.uv;
  for (let vertex = 0; vertex < position.count; vertex++) {
    // Across the key left to right; along it from the back (-z) to the front.
    const u = (position.getX(vertex) - min.x) / (max.x - min.x);
    const v = (position.getZ(vertex) - min.z) / (max.z - min.z);
    uv[vertex * 2] = u0 + u * (u1 - u0);
    uv[vertex * 2 + 1] = v0 + v * (v1 - v0);
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.scale(across, 1000, KIT_DEPTH);
  geometry.translate(0, KIT_TOP, 0);
  return splitUp(geometry);
}
