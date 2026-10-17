import {
  Bone,
  Box3,
  BufferAttribute,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  Vector3
} from "three";
import type { Object3D } from "three";

const HAT = ["Black_TopHat_Brim", "Black_TopHat_Crown", "Black_TopHat_Ribbon"];
const COLLAR = ["White_TurnDown_Collar_L", "White_TurnDown_Collar_R", "White_Shirt_Front"];

/** Local, reversible repairs of the trial outfit; the private model on disk stays untouched. */
export class PianistAppearance {
  private readonly groups: Group[] = [];
  private readonly geometries: { dispose(): void }[] = [];
  private readonly hidden: Object3D[] = [];
  private readonly shirt = new MeshStandardMaterial({
    color: 0xe8e6df,
    roughness: 0.9,
    side: DoubleSide
  });

  constructor(private readonly scene: Object3D) {
    scene.updateMatrixWorld(true);
    this.hat();
    this.collar();
  }

  private posed(node: SkinnedMesh): Vector3[] {
    node.skeleton.update();
    const inverse = this.scene.matrixWorld.clone().invert();
    return Array.from({ length: node.geometry.getAttribute("position").count }, (_, i) =>
      node.getVertexPosition(i, new Vector3()).applyMatrix4(node.matrixWorld).applyMatrix4(inverse)
    );
  }

  /** Attach a posed, scene-coordinate group to a bone without moving the bone or its skin. */
  private attach(group: Group, bone: Bone, origin = new Vector3()): void {
    const matrix = bone.matrixWorld
      .clone()
      .invert()
      .multiply(this.scene.matrixWorld)
      .multiply(new Matrix4().makeTranslation(origin));
    matrix.decompose(group.position, group.quaternion, group.scale);
    bone.add(group);
    this.groups.push(group);
  }

  private hide(node: Object3D): void {
    if (node.visible) this.hidden.push(node);
    node.visible = false;
  }

  private hat(): void {
    const head = this.scene.getObjectByName("head");
    const nodes = HAT.map((name) => this.scene.getObjectByName(name));
    if (
      !(head instanceof Bone) ||
      !nodes.every((node): node is SkinnedMesh => node instanceof SkinnedMesh)
    )
      return;
    const [brim, crown] = nodes;
    if (!brim || !crown) return;
    const points = this.posed(brim);
    const anchor = new Box3().setFromPoints(points).getCenter(new Vector3());
    const crownPoints = this.posed(crown);
    const position = crown.geometry.getAttribute("position");
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < position.count; i++) {
      low = Math.min(low, position.getY(i));
      high = Math.max(high, position.getY(i));
    }
    const centres = [new Vector3(), new Vector3()];
    const counts = [0, 0];
    for (let i = 0; i < position.count; i++) {
      const band =
        position.getY(i) < low + (high - low) * 0.1
          ? 0
          : position.getY(i) > high - (high - low) * 0.1
            ? 1
            : -1;
      if (band < 0) continue;
      centres[band]?.add(crownPoints[i] ?? new Vector3());
      counts[band] = (counts[band] ?? 0) + 1;
    }
    const bottom = centres[0]?.divideScalar(counts[0] ?? 1),
      top = centres[1]?.divideScalar(counts[1] ?? 1);
    if (!bottom || !top || top.distanceTo(bottom) < 0.01) return;
    const upright = new Quaternion().setFromUnitVectors(
      top.sub(bottom).normalize(),
      new Vector3(0, 1, 0)
    );
    const group = new Group();
    group.name = "Fitted_TopHat";
    for (const node of nodes) {
      const geometry = node.geometry.clone();
      const repaired = this.posed(node).flatMap((point) =>
        point
          .sub(anchor)
          .applyQuaternion(upright)
          .multiply(new Vector3(0.9, 0.72, 0.9))
          .toArray()
      );
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(repaired), 3));
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, node.material);
      mesh.name = node.name + "_Fitted";
      mesh.frustumCulled = false;
      group.add(mesh);
      this.geometries.push(geometry);
      this.hide(node);
    }
    this.attach(group, head as Bone, anchor);
  }

  private collar(): void {
    const chest = this.scene.getObjectByName("chest");
    const nodes = COLLAR.map((name) => this.scene.getObjectByName(name));
    if (
      !(chest instanceof Bone) ||
      !nodes.every((node): node is SkinnedMesh => node instanceof SkinnedMesh)
    )
      return;
    const bounds = new Box3().setFromPoints(nodes.flatMap((node) => this.posed(node)));
    const centre = bounds.getCenter(new Vector3());
    const group = new Group();
    group.name = "Fitted_Shirt_Collar";
    const width = bounds.max.x - bounds.min.x;
    const top = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.56;
    const z = bounds.min.z - 0.001;
    for (const side of [-1, 1]) {
      const coordinates = [
        [centre.x + side * width * 0.09, top, z],
        [centre.x + side * width * 0.36, top + 0.006, z + 0.006],
        [centre.x + side * width * 0.2, top - 0.023, z - 0.002],
        [centre.x + side * width * 0.025, top - 0.008, z - 0.002]
      ];
      const geometry = nodes[0]?.geometry.clone();
      if (!geometry) continue;
      for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(coordinates.flat()), 3)
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.clearGroups();
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.shirt);
      mesh.frustumCulled = false;
      group.add(mesh);
      this.geometries.push(geometry);
    }
    for (const node of nodes) this.hide(node);
    this.attach(group, chest as Bone);
  }

  dispose(): void {
    for (const group of this.groups) group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const node of this.hidden) node.visible = true;
    this.shirt.dispose();
    this.groups.length = this.geometries.length = this.hidden.length = 0;
  }
}
