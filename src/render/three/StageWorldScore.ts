import { Box3, Group, type Scene, type WebGLRenderer } from "three";
import type { KeysScene } from "../NativeKeyboardScene";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import type { KeyBox } from "./keyBoxes";
import type { FreeSceneCamera } from "./FreeSceneCamera";
import { WorldScorePoster } from "./WorldScorePoster";
import { freeFieldReach } from "../freeRoadLayout";

/** Keep structural poster placement independent of note batches and transient particles. */
export class StageWorldScore extends WorldScorePoster {
  private readonly root = new Group();
  private readonly bounds = new Box3();
  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    private readonly parent: Group,
    private readonly free: FreeSceneCamera
  ) {
    super(renderer.capabilities.maxTextureSize, () => {
      free.invalidate(false);
    });
    this.root.add(this.group);
    scene.add(this.root);
  }
  draw(
    keys: KeysScene,
    boxes: readonly KeyBox[],
    enabled: boolean,
    field?: Partial<Pick<ThreeRoadFrame, "freeLayout" | "freeLanes">>,
    activeCamera = this.free
  ): void {
    const camera = keys.roadCamera ?? keys.camera;
    const centre = ((boxes[0]?.x ?? 0) + (boxes.at(-1)?.x ?? 0)) / 2;
    const layout = field?.freeLayout;
    let top = 22 + 1000 * (layout ? freeFieldReach(layout).rise : 2);
    if (field?.freeLanes?.length) {
      top = -Infinity;
      for (const lane of field.freeLanes) top = Math.max(top, lane.far.y);
    }
    const bottom = top + 200;
    this.update(enabled, camera.params.orthographicScale !== undefined, centre, bottom);
    this.root.position.copy(this.parent.position);
    this.root.scale.copy(this.parent.scale);
    this.root.updateMatrixWorld(true);
    activeCamera.setScoreBounds(
      this.group.visible ? this.structuralBounds(this.bounds) : undefined
    );
  }
  override dispose(): void {
    super.dispose();
    this.root.removeFromParent();
    this.free.setScoreBounds(undefined);
  }
}
