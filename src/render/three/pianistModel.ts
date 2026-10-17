/**
 * The user's own pianist: a GLB with their face, kept in the git-ignored local-models folder and
 * served only by the local dev server. A production build never looks for it, so it can never
 * carry the model or its textures.
 */
const FOUND: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? import.meta.glob<string>("/local-models/pianist.glb", { query: "?url", import: "default" })
  : {};

const load = FOUND["/local-models/pianist.glb"];

/** Whether the local pianist model is there to be shown. */
export const PIANIST_AVAILABLE = load !== undefined;

/** The model's URL, or undefined without one. */
export function pianistModelUrl(): Promise<string | undefined> {
  return load ? load() : Promise.resolve(undefined);
}
