import { describe, expect, it } from "vitest";
import { readBuildInfo } from "./buildInfo";

const sha = "bf6b780978702193f91bb9e7c0689a5652c209bf";
const builtAt = "2026-10-05T13:04:11.000Z";
const version = "0.0.67";

describe("build info", () => {
  it("reads the commit and the pull request the deploy passed", () => {
    expect(readBuildInfo({ VITE_GIT_SHA: sha, VITE_GIT_PR: "67" }, builtAt, version)).toEqual({
      version,
      sha,
      pr: 67,
      builtAt
    });
  });

  it("leaves the pull request out for a direct commit", () => {
    expect(readBuildInfo({ VITE_GIT_SHA: sha, VITE_GIT_PR: "" }, builtAt, version).pr).toBeNull();
  });

  it("treats a missing or placeholder commit as a local build", () => {
    expect(readBuildInfo({}, builtAt, version)).toEqual({ version, sha: null, pr: null, builtAt });
    expect(readBuildInfo({ VITE_GIT_SHA: "local" }, builtAt, version).sha).toBeNull();
  });
});
