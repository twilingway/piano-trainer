import {
  BoxGeometry,
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
  private hinged: Hinged[] = [];
  private version = -1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly context: WebGL2RenderingContext
  ) {
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.camera.matrixAutoUpdate = false;
    const sun = new DirectionalLight(0xffffff, 2.4);
    // Above, in front of the keys and a little to the left: front faces lit, sides shaded.
    sun.position.set(-300, 900, 700);
    this.scene.add(new HemisphereLight(0xffffff, 0x3a3f4c, 1.8), sun, this.keys);
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
    for (const material of [this.top, this.white, this.black]) material.dispose();
    this.renderer.dispose();
  }

  private build(keys: KeysScene): void {
    this.clear();
    this.version = keys.version;
    for (const box of keyBoxes(keys)) {
      const mesh = new Mesh(boxGeometry(box), [this.top, box.black ? this.black : this.white]);
      // The hinge sits on the key's back bottom edge; the box hangs forward from it.
      mesh.position.set(0, (box.top - box.bottom) / 2, (box.back - box.front) / 2);
      const hinge = new Group();
      hinge.position.set(box.x, box.bottom, -box.back);
      hinge.add(mesh);
      this.keys.add(hinge);
      this.hinged.push({ pitch: box.pitch, hinge, mesh });
    }
  }

  private clear(): void {
    for (const { hinge, mesh } of this.hinged) {
      mesh.geometry.dispose();
      this.keys.remove(hinge);
    }
    this.hinged = [];
  }
}

/** A box whose top face shows the key's rect of the picture; every other face is plain. */
function boxGeometry(box: KeyBox): BoxGeometry {
  const length = box.back - box.front;
  const geometry = new BoxGeometry(box.width, box.top - box.bottom, length);
  // Faces in order +x, -x, +y, -y, +z, -z: the top is the third, four vertices from 8.
  for (const group of geometry.groups) group.materialIndex = group.start === 12 ? 0 : 1;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const { u0, u1, v0, v1 } = box.uv;
  for (let vertex = 8; vertex < 12; vertex++) {
    // Across the key left to right; along it from the back (-z) to the front (+z).
    const u = position.getX(vertex) / box.width + 0.5;
    const v = position.getZ(vertex) / length + 0.5;
    uv.setXY(vertex, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  return geometry;
}
