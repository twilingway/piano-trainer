import { DOCKED_ROAD_SHADER } from "../dockedRoadProjection";
import { configureSegmentedRoad } from "./segmentedRoadGeometry";
import { Line, Points, ShaderMaterial, Matrix4, Vector4 } from "three";
import type { Camera, Material, Object3D } from "three";
import { roadWidthUniforms } from "./roadWidthUniforms";

const installed = new WeakSet<Material>();
const worldClip = new Matrix4();
const keyboardClip = new Matrix4();
const inverse = new Matrix4();
const localY = new Vector4(0, 1, 0, 0);
export function updateDockedKeyOffsets(
  hinged: readonly { readonly pitch: number; readonly hinge: Object3D }[]
): void {
  const offsets = roadWidthUniforms.roadDockOffsets.value;
  offsets.fill(0);
  for (const { pitch, hinge } of hinged)
    if (pitch >= 21 && pitch <= 108) offsets[pitch - 21] = hinge.position.y;
}
export function dockedKeyOffset(pitch: number): number {
  return roadWidthUniforms.roadDockOffsets.value[pitch - 21] ?? 0;
}
/** Ordinary guide materials share the exact same homogeneous transition as note bodies. */
function installGuide(material: Material): void {
  if (installed.has(material)) return;
  installed.add(material);
  const compile = material.onBeforeCompile.bind(material);
  const cacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => cacheKey() + "-docked-road-v1";
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.roadDockOffsets = roadWidthUniforms.roadDockOffsets;
    shader.uniforms.roadDockY = roadWidthUniforms.roadDockY;
    shader.uniforms.roadDockEnabled = roadWidthUniforms.roadDockEnabled;
    shader.uniforms.roadDockTransform = roadWidthUniforms.roadDockTransform;
    shader.vertexShader = `uniform float roadDockEnabled;
uniform mat4 roadDockTransform;
attribute float roadDockProgress;
attribute float roadDockPitch;
attribute vec3 roadDockAnchor;
uniform float roadDockOffsets[88];
uniform vec4 roadDockY;
${DOCKED_ROAD_SHADER}
${shader.vertexShader}`.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
if (roadDockEnabled > 0.0) {
  vec4 anchor = projectionMatrix * modelViewMatrix * vec4(roadDockAnchor, 1.0);
  vec4 pinned = roadDockTransform * anchor;
  if (roadDockPitch >= 21.0 && roadDockPitch <= 108.0) pinned += roadDockY * roadDockOffsets[int(floor(roadDockPitch + 0.5)) - 21];
  gl_Position = anchorRelativeRoadClip(gl_Position, anchor, pinned, roadDockProgress);
}`
    );
  };
  material.needsUpdate = true;
}
/** Called once immediately before the road's render passes; no clock or camera ownership. */
export function configureDockedRoad(
  roadGroup: Object3D,
  worldCamera: Camera,
  keyboardCamera: Camera,
  enabled: boolean,
  nearZ: number,
  farZ: number,
  keys: Object3D = roadGroup
): void {
  enabled = enabled && Number.isFinite(nearZ) && Number.isFinite(farZ) && farZ > nearZ;
  roadWidthUniforms.roadDockEnabled.value = enabled ? 1 : 0;
  configureSegmentedRoad(roadGroup, enabled);
  if (!enabled) return;
  roadGroup.updateWorldMatrix(true, true);
  if (keys !== roadGroup) keys.updateWorldMatrix(true, false);
  worldCamera.updateMatrixWorld();
  keyboardCamera.updateMatrixWorld();
  worldClip.multiplyMatrices(worldCamera.projectionMatrix, worldCamera.matrixWorldInverse);
  keyboardClip.multiplyMatrices(keyboardCamera.projectionMatrix, keyboardCamera.matrixWorldInverse);
  // Road-local contacts share the keys' local units; the keyboard pass sees them on the keys.
  keyboardClip.multiply(keys.matrixWorld);
  inverse.copy(worldClip).multiply(roadGroup.matrixWorld).invert();
  roadWidthUniforms.roadDockTransform.value.multiplyMatrices(keyboardClip, inverse);
  roadWidthUniforms.roadDockY.value.copy(localY).applyMatrix4(keyboardClip);
  roadWidthUniforms.roadDockInverse.value.copy(worldClip).multiply(roadGroup.matrixWorld).invert();
  roadGroup.traverse((object) => {
    if (!(object instanceof Line || object instanceof Points)) return;
    const materials = (
      Array.isArray(object.material) ? object.material : [object.material]
    ) as Material[];
    for (const material of materials)
      if (!(material instanceof ShaderMaterial)) installGuide(material);
  });
}
