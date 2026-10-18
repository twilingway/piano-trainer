import type { BufferGeometry, Material, Object3D, Skeleton, Texture } from "three";

/** Owns one loaded model; shared resources inside its scene are released only once. */
export function disposePianistModel(scene: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  scene.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
      skeleton?: Skeleton;
    };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.skeleton) skeletons.add(mesh.skeleton);
    if (mesh.material)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        materials.add(material);
  });
  for (const material of materials)
    for (const value of Object.values(material) as unknown[])
      if (value && typeof value === "object" && "isTexture" in value && value.isTexture === true)
        textures.add(value as Texture);
  for (const skeleton of skeletons) skeleton.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
