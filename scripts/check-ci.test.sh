#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
cat > "$temp_dir/curl" <<'SH'
#!/usr/bin/env bash
cat "$CI_FIXTURE"
SH
chmod +x "$temp_dir/curl"

sha=0123456789abcdef0123456789abcdef01234567
other=1111111111111111111111111111111111111111

run_case() {
  local expected="$1" body="$2" actual
  printf '%s\n' "$body" > "$temp_dir/response.json"
  actual="$(PATH="$temp_dir:$PATH" CI_FIXTURE="$temp_dir/response.json" bash "$script_dir/check-ci.sh" "$sha")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'expected %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}

run_case green "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"completed\",\"conclusion\":\"success\"}]}"
run_case red "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"completed\",\"conclusion\":\"failure\"}]}"
run_case pending "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"in_progress\",\"conclusion\":null}]}"
run_case missing '{"check_runs":[]}'
run_case missing "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$other\",\"status\":\"completed\",\"conclusion\":\"success\"}]}"
run_case green "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"completed\",\"conclusion\":\"failure\"},{\"id\":2,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"completed\",\"conclusion\":\"success\"}]}"
run_case pending "{\"check_runs\":[{\"id\":1,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"completed\",\"conclusion\":\"success\"},{\"id\":2,\"name\":\"gate\",\"app\":{\"slug\":\"github-actions\"},\"head_sha\":\"$sha\",\"status\":\"in_progress\",\"conclusion\":null}]}"
printf 'check-ci fixtures passed\n'
