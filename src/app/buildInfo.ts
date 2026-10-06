declare const __BUILD_TIME__: string;
import { version as packageVersion } from "../../package.json";

export const REPOSITORY_URL = "https://github.com/twilingway/piano-trainer";

/** What the running bundle was built from; the deploy passes the commit and its pull request. */
export interface BuildInfo {
  readonly version: string;
  readonly sha: string | null;
  readonly pr: number | null;
  /** ISO time in UTC. */
  readonly builtAt: string;
}

/** Keep only a full commit SHA and a positive PR number: anything else is a local build. */
export function readBuildInfo(
  env: Readonly<Record<string, unknown>>,
  builtAt: string,
  version: string
): BuildInfo {
  const sha = env.VITE_GIT_SHA;
  const pr = Number(env.VITE_GIT_PR);
  return {
    version,
    sha: typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) ? sha : null,
    pr: Number.isInteger(pr) && pr > 0 ? pr : null,
    builtAt
  };
}

export const BUILD_INFO = readBuildInfo(import.meta.env, __BUILD_TIME__, packageVersion);
