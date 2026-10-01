#!/usr/bin/env bash
set -euo pipefail

sha="${1:?commit SHA required}"
repo="${DEPLOY_REPO:-twilingway/piano-trainer}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo missing; exit 0; }

body="$(curl -fsS --max-time 20 \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/${repo}/commits/${sha}/check-runs?check_name=gate&per_page=100" 2>/dev/null)" || {
  echo missing
  exit 0
}

printf '%s' "$body" | node -e '
let raw = "";
process.stdin.on("data", chunk => raw += chunk);
process.stdin.on("end", () => {
  try {
    const body = JSON.parse(raw);
    const runs = body.check_runs;
    if (!Array.isArray(runs)) return console.log("missing");
    const run = runs
      .filter(item => item.name === "gate" && item.app?.slug === "github-actions" && item.head_sha === process.argv[1])
      .sort((left, right) => right.id - left.id)[0];
    if (!run) return console.log("missing");
    if (run.status !== "completed") return console.log("pending");
    console.log(run.conclusion === "success" ? "green" : "red");
  } catch {
    console.log("missing");
  }
});
' "$sha"
