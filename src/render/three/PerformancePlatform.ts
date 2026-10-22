import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry
} from "three";
import type { PerformanceStageLayout } from "./performanceStageLayout";

/** Opaque raised platform; it receives the same real light as the instrument. */
export class PerformancePlatform {
  readonly group = new Group();
  private readonly geometry = new CylinderGeometry(1, 1, 1, 96);
  private readonly topGeometry = new CircleGeometry(1, 96);
  private readonly trimGeometry = new TorusGeometry(1, 0.008, 8, 128);
  private readonly side = new MeshStandardMaterial({
    color: 0x080a0e,
    roughness: 0.65,
    metalness: 0.35
  });
  private readonly surface = new MeshStandardMaterial({
    color: 0x11151b,
    roughness: 0.82,
    metalness: 0.1
  });
  private readonly trim = new MeshStandardMaterial({
    color: 0x252a32,
    roughness: 0.4,
    metalness: 0.75
  });
  private readonly body = new Mesh(this.geometry, this.side);
  private readonly top = new Mesh(this.topGeometry, this.surface);
  private readonly rim = new Mesh(this.trimGeometry, this.trim);

  constructor() {
    this.top.rotation.x = -Math.PI / 2;
    this.rim.rotation.x = Math.PI / 2;
    this.group.add(this.body, this.top, this.rim);
  }
  layout(stage: PerformanceStageLayout): void {
    const { centre, radius, top, thickness } = stage;
    this.body.position.set(centre.x, top - thickness / 2, centre.z);
    this.body.scale.set(radius, thickness, radius);
    this.top.position.set(centre.x, top + 0.5 * stage.unit, centre.z);
    this.top.scale.setScalar(radius * 0.992);
    this.rim.position.set(centre.x, top - 7 * stage.unit, centre.z);
    this.rim.scale.setScalar(radius);
  }
  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of [this.geometry, this.topGeometry, this.trimGeometry]) geometry.dispose();
    for (const material of [this.side, this.surface, this.trim]) material.dispose();
  }
}
