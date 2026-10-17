import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Hand } from "../../fingering/fingering";
import type { TrackPose } from "./handSolver/track";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): boolean =>
  typeof value === "number"
    ? Number.isFinite(value)
    : value !== null && typeof value === "object" && Object.values(value).every(finite);
const poseShape = (value: unknown): value is TrackPose =>
  record(value) &&
  Array.isArray(value.rootVec) &&
  value.rootVec.length === 6 &&
  record(value.angles) &&
  Object.keys(value.angles).length === 5 &&
  record(value.press) &&
  record(value.hover) &&
  record(value.pitches) &&
  finite(value);

/** Runtime transition edits must not invalidate the expensive offline fit prefix. */
export function offlineFitSources(
  read: (path: string) => string = (path) => readFileSync(path, "utf8")
): string[] {
  return [
    "handScenePose.ts",
    "fitSkin.ts",
    "fitSkinPose.ts",
    "skinConstraints.ts",
    "skinGeometry.ts",
    "pianistRigProfile.ts",
    "handKeySolids.ts",
    "handContact.ts",
    "handSolver/mech.ts",
    "handSolver/fit.ts"
  ].map((file) => {
    const source = read(`src/render/three/${file}`);
    if (file !== "handScenePose.ts") return source;
    const boundary = source.indexOf("export function sampleSceneTrack(");
    if (boundary < 0) throw new Error("Cannot identify offline hand-scene source boundary");
    return source.slice(0, boundary);
  });
}

export function offlinePoseFingerprint(
  glb: Uint8Array,
  midi: Uint8Array,
  anatomy: unknown,
  sources: readonly string[]
): string {
  const digest = createHash("sha256");
  for (const bytes of [
    glb,
    midi,
    Buffer.from(JSON.stringify(anatomy)),
    ...sources.map((s) => Buffer.from(s))
  ]) {
    digest.update(String(bytes.byteLength) + ":");
    digest.update(bytes);
  }
  return digest.digest("hex");
}

/** Private test acceleration only: no persisted value may skip source or physical acceptance. */
export class PianistOfflineCache {
  private poses: Record<string, TrackPose> = {};
  hits = 0;
  misses = 0;
  constructor(
    private readonly identity: string,
    private readonly file?: string
  ) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (
        record(data) &&
        data.version === 1 &&
        data.identity === identity &&
        record(data.poses) &&
        Object.values(data.poses).every(poseShape) &&
        data.checksum === hash(JSON.stringify(data.poses))
      )
        this.poses = data.poses as Record<string, TrackPose>;
    } catch {
      // Missing, truncated, or stale cache is always recomputed.
    }
  }
  fit(hand: Hand, input: TrackPose, solve: () => TrackPose): TrackPose {
    const key = JSON.stringify([hand, input]);
    let output = this.poses[key];
    if (output) this.hits++;
    else {
      output = solve();
      if (!poseShape(output)) throw new Error("Offline fit returned an invalid pose");
      this.poses[key] = output;
      this.misses++;
      if (this.misses % 50 === 0) this.flush();
    }
    const count = this.hits + this.misses;
    if (count % 50 === 0)
      process.stdout.write(
        `Pianist offline poses=${String(count)} cacheHits=${String(this.hits)} fitted=${String(this.misses)}\n`
      );
    return output;
  }
  flush(): void {
    if (!this.file || this.misses === 0) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(
      this.file,
      JSON.stringify({
        version: 1,
        identity: this.identity,
        poses: this.poses,
        checksum: hash(JSON.stringify(this.poses))
      }),
      "utf8"
    );
  }
}

export function pianistTestRange(
  value: string | undefined,
  until: number
): readonly [number, number] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(":");
  const start = Number(parts[0]),
    end = Number(parts[1]);
  if (
    parts.length !== 2 ||
    parts.some((p) => p.trim() === "") ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    start >= until
  )
    throw new Error(
      "PIANIST_TEST_RANGE must be an increasing start:end interval inside the test span"
    );
  return [start, Math.min(end, until)];
}
