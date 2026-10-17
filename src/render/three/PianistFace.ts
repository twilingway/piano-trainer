import {
  Bone,
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Quaternion,
  SkinnedMesh,
  Vector3
} from "three";
import type { Material, Matrix4, Object3D } from "three";
import { performerExpression } from "./performerExpression";
import type { ExpressionNote, PerformerExpression } from "./performerExpression";

interface Eye {
  readonly iris: Group;
  readonly cap: Mesh;
  readonly right: Vector3;
  readonly up: Vector3;
}
interface BakedPart {
  readonly mesh: Mesh;
  readonly points: readonly Vector3[];
}
function meshes(node: Object3D): Mesh[] {
  const result: Mesh[] = [];
  node.traverse((part) => {
    if (part instanceof Mesh) result.push(part as Mesh);
  });
  return result;
}
function posed(mesh: Mesh, inverse: Matrix4): Vector3[] {
  const position = mesh.geometry.attributes.position;
  if (!position) return [];
  if (mesh instanceof SkinnedMesh) mesh.skeleton.update();
  return Array.from({ length: position.count }, (_, index) =>
    mesh
      .getVertexPosition(index, new Vector3())
      .applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse)
  );
}
const finite = (point: Vector3): boolean => point.toArray().every(Number.isFinite);

/** Reversible eye-only copies follow head; no source vertices, skin weights or bones are edited. */
export class PianistFace {
  readonly group = new Group();
  private readonly eyes: Eye[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials = new Map<Material, Material>();
  private readonly hidden = new Map<Object3D, boolean>();
  private readonly blink = { value: 0 };
  private readonly yaw = new Quaternion();
  private readonly pitch = new Quaternion();
  private disposed = false;

  static create(scene: Object3D): PianistFace | undefined {
    const head = scene.getObjectByName("head");
    if (!(head instanceof Bone)) return undefined;
    // Refresh attached skin bind matrices before baking, even if the parent pianist is scaled.
    scene.updateWorldMatrix(true, false);
    scene.updateMatrixWorld(true);
    const face = new PianistFace(head as Bone);
    try {
      for (const side of [1, -1])
        if (!face.eye(scene, side)) {
          face.dispose();
          return undefined;
        }
      head.add(face.group);
      face.update(0);
      return face;
    } catch {
      face.dispose();
      return undefined;
    }
  }

  private constructor(private readonly head: Bone) {
    this.group.name = "PianistFace";
  }

  private eye(scene: Object3D, side: number): boolean {
    const eyeball = scene.getObjectByName(`Eye_${String(side)}`);
    const source = scene.getObjectByName(`Iris_${String(side)}`);
    const eyelid = scene.getObjectByName(`Personal_Eyelid_${String(side)}`);
    if (!eyeball || !source || !eyelid) return false;
    const inverse = this.head.matrixWorld.clone().invert();
    const eyePoints = meshes(eyeball).flatMap((mesh) => posed(mesh, inverse));
    const parts: BakedPart[] = meshes(source).map((mesh) => ({
      mesh,
      points: posed(mesh, inverse)
    }));
    const irisPoints = parts.flatMap((part) => part.points);
    const skin = meshes(eyelid).flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    )[0];
    if (
      !skin ||
      eyePoints.length < 4 ||
      irisPoints.length < 3 ||
      !eyePoints.every(finite) ||
      !irisPoints.every(finite)
    )
      return false;
    const centre = new Box3().setFromPoints(eyePoints).getCenter(new Vector3());
    const front = new Box3().setFromPoints(irisPoints).getCenter(new Vector3()).sub(centre);
    if (front.lengthSq() < 1e-12) return false;
    front.normalize();
    const up = new Vector3(0, 1, 0).addScaledVector(front, -front.y);
    if (up.lengthSq() < 1e-6) return false;
    up.normalize();
    const right = front.clone().cross(up).normalize();
    const radii = new Vector3();
    const delta = new Vector3();
    for (const point of eyePoints) {
      delta.copy(point).sub(centre);
      radii.x = Math.max(radii.x, Math.abs(delta.dot(right)));
      radii.y = Math.max(radii.y, Math.abs(delta.dot(up)));
      radii.z = Math.max(radii.z, Math.abs(delta.dot(front)));
    }
    if (Math.min(radii.x, radii.y, radii.z) < 1e-6) return false;
    let shell = 1;
    for (const point of irisPoints) {
      delta.copy(point).sub(centre);
      shell = Math.max(
        shell,
        Math.hypot(delta.dot(right) / radii.x, delta.dot(up) / radii.y, delta.dot(front) / radii.z)
      );
    }
    // The lid covers the actual iris/cornea, including its tiny eye rotation, without touching skin.
    if (shell > 1.3) return false;
    radii.multiplyScalar(shell + 0.015);
    const iris = new Group();
    iris.name = `PianistIris_${String(side)}`;
    iris.position.copy(centre);
    iris.visible = source.visible;
    this.group.add(iris);
    for (const part of parts) {
      const geometry = part.mesh.geometry.clone();
      this.geometries.push(geometry);
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          part.points.flatMap((point) => point.clone().sub(centre).toArray()),
          3
        )
      );
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      geometry.morphAttributes = {};
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const copy = new Mesh(geometry, part.mesh.material);
      copy.name = part.mesh.name + "_FaceCopy";
      copy.visible = part.mesh.visible;
      iris.add(copy);
    }
    const geometry = this.capGeometry(centre, right, up, front, radii);
    this.geometries.push(geometry);
    const cap = new Mesh(geometry, this.capMaterial(skin));
    cap.name = `PianistBlink_${String(side)}`;
    cap.visible = false;
    this.group.add(cap);
    this.eyes.push({ iris, cap, right, up });
    this.hidden.set(source, source.visible);
    source.visible = false;
    return true;
  }

  private capGeometry(
    centre: Vector3,
    right: Vector3,
    up: Vector3,
    front: Vector3,
    radii: Vector3
  ): BufferGeometry {
    const columns = 32,
      rows = 24;
    const positions: number[] = [],
      heights: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= rows; row++) {
      const phi = -Math.PI / 2 + (row / rows) * Math.PI;
      for (let column = 0; column <= columns; column++) {
        const theta = -Math.PI / 2 + (column / columns) * Math.PI;
        const point = centre
          .clone()
          .addScaledVector(right, radii.x * Math.cos(phi) * Math.sin(theta))
          .addScaledVector(up, radii.y * Math.sin(phi))
          .addScaledVector(front, radii.z * Math.cos(phi) * Math.cos(theta));
        positions.push(...point.toArray());
        heights.push(Math.sin(phi));
        uv.push(column / columns, row / rows);
        if (row < rows && column < columns) {
          const a = row * (columns + 1) + column,
            b = a + 1,
            c = a + columns + 1,
            d = c + 1;
          // Character-right cross up points away from front, so reverse the grid winding.
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("faceLidY", new Float32BufferAttribute(heights, 1));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private capMaterial(source: Material): Material {
    const existing = this.materials.get(source);
    if (existing) return existing;
    const material = source.clone();
    this.materials.set(source, material);
    const compile = source.onBeforeCompile.bind(material);
    const cacheKey = source.customProgramCacheKey.bind(source);
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.uniforms.faceBlink = this.blink;
      shader.vertexShader =
        "attribute float faceLidY; varying float vFaceLidY;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvFaceLidY = faceLidY;"
        );
      shader.fragmentShader =
        "uniform float faceBlink; varying float vFaceLidY;\n" +
        shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif (faceBlink <= 0.0 || vFaceLidY < 1.0 - 2.0 * faceBlink) discard;"
        );
    };
    material.customProgramCacheKey = () => cacheKey() + "|pianist-blink-v1";
    return material;
  }

  /** Call after skeletal head motion. Head-gaze hints are returned for the rig's own application. */
  update(time: number, notes?: readonly ExpressionNote[]): PerformerExpression {
    const expression = performerExpression(time, notes);
    if (this.disposed) return expression;
    this.blink.value = expression.blink;
    for (const eye of this.eyes) {
      this.yaw.setFromAxisAngle(eye.up, -expression.eyeYaw);
      this.pitch.setFromAxisAngle(eye.right, expression.eyePitch);
      eye.iris.quaternion.multiplyQuaternions(this.yaw, this.pitch);
      eye.cap.visible = expression.blink > 0.0001;
    }
    return expression;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const [node, visible] of this.hidden) node.visible = visible;
    this.eyes.length = this.geometries.length = 0;
    this.materials.clear();
    this.hidden.clear();
  }
}
