import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SourcePerformanceIdentity } from "../../song/sourcePerformance";
import { disposePianistModel } from "./disposePianistModel";
import { readNativePerformance } from "./nativePianistClip";
import type { PianistModel } from "./pianist";

const FOUND: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? import.meta.glob<string>("/local-models/pianist-performance.glb", {
      query: "?url",
      import: "default"
    })
  : {};

/** Private, complete native animation is optional and never bundled in a release. */
export async function loadNativePianist(
  source: SourcePerformanceIdentity | undefined
): Promise<PianistModel | undefined> {
  const load = FOUND["/local-models/pianist-performance.glb"];
  if (!source || !load) return undefined;
  const model = await new GLTFLoader().loadAsync(await load());
  const clip =
    model.animations.find((value) => value.name === "SourcePerformance") ?? model.animations[0];
  const performance = readNativePerformance(model.scene, clip, source);
  if (!performance) {
    disposePianistModel(model.scene);
    return undefined;
  }
  return { scene: model.scene, clip, performance };
}
