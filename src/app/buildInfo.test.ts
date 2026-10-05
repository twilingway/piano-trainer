import { describe, expect, it } from "vitest";
import { readBuildInfo } from "./buildInfo";

const sha = "bf6b780978702193f91bb9e7c0689a5652c209bf";
const builtAt = "2026-10-05T13:04:11.000Z";

describe("build info", () => {
  it("reads the commit and the pull request the deploy passed", () => {
    expect(readBuildInfo({ VITE_GIT_SHA: sha, VITE_GIT_PR: "67" }, builtAt)).toEqual({
      sha,
      pr: 67,
      builtAt
    });
  });

  it("leaves the pull request out for a direct commit", () => {
    expect(readBuildInfo({ VITE_GIT_SHA: sha, VITE_GIT_PR: "" }, builtAt).pr).toBeNull();
  });

  it("treats a missing or placeholder commit as a local build", () => {
    expect(readBuildInfo({}, builtAt)).toEqual({ sha: null, pr: null, builtAt });
    expect(readBuildInfo({ VITE_GIT_SHA: "local" }, builtAt).sha).toBeNull();
  });
});
