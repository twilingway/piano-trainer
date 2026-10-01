#!/usr/bin/env bash
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"
export PATH

PIANO_PROD_DIR="${PIANO_PROD_DIR:-$HOME/piano-prod}"
REPO_DIR="${PIANO_PROD_DIR}/repo"
STATE_DIR="${PIANO_PROD_DIR}/state"
ENV_FILE="${PIANO_PROD_DIR}/.env.production"
COMPOSE_FILE="${REPO_DIR}/docker-compose.prod.yml"
mkdir -p "$STATE_DIR"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$STATE_DIR/deploy.log"; }
fail() { log "ERROR: $*"; exit 1; }

target_sha=""
local_only=0
while (($#)); do
  case "$1" in
    --sha) target_sha="${2:-}"; shift 2 ;;
    --local-only) local_only=1; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -f "$ENV_FILE" && -d "$REPO_DIR/.git" ]] || fail "Deployment checkout or config is missing."
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
PUBLIC_URL="${PUBLIC_URL:-https://piano.twiling.ru}"
PROXY_NETWORK="${PROXY_NETWORK:-public_net}"
PUBLIC_URL="${PUBLIC_URL%/}"

if docker compose version >/dev/null 2>&1; then
  compose_command=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_command=(docker-compose)
else
  fail "Docker Compose is unavailable."
fi
compose() { "${compose_command[@]}" --project-name piano --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

rollback() {
  local previous="$1"
  if [[ -z "$previous" ]]; then
    log "No previous release; stopping the failed first container."
    compose stop piano-web || true
    return
  fi
  if ! docker image inspect "piano-trainer:$previous" >/dev/null 2>&1; then
    log "Previous image piano-trainer:$previous is missing."
    return
  fi
  log "Rolling back to $previous."
  IMAGE_TAG="$previous" compose up -d --no-build piano-web || log "Rollback failed."
}

wait_for_local() {
  local deadline=$((SECONDS + 90)) container status
  while ((SECONDS < deadline)); do
    container="$(compose ps -q piano-web 2>/dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"
      [[ "$status" == healthy ]] && return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_public() {
  local expected="$1" deadline=$((SECONDS + 120)) served page assets asset
  while ((SECONDS < deadline)); do
    served="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "$PUBLIC_URL/version.txt" 2>/dev/null || true)"
    if [[ "$served" == "$expected" ]]; then
      page="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "$PUBLIC_URL/" 2>/dev/null || true)"
      if [[ "$page" == *"<html"* ]]; then
        assets="$(printf '%s' "$page" | grep -oE '/assets/[^" ]+' | sort -u || true)"
        if [[ -n "$assets" ]]; then
          while IFS= read -r asset; do
            curl -fsS --max-time 10 -o /dev/null "$PUBLIC_URL$asset" || return 1
          done <<< "$assets"
          return 0
        fi
      fi
    fi
    sleep 3
  done
  return 1
}

docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || fail "Docker network $PROXY_NETWORK is missing."
[[ -z "$(git -C "$REPO_DIR" status --porcelain)" ]] || fail "Deployment checkout has local changes."
git -C "$REPO_DIR" fetch --prune origin "$DEPLOY_BRANCH" >/dev/null 2>&1 || fail "Could not fetch $DEPLOY_BRANCH."
branch_sha="$(git -C "$REPO_DIR" rev-parse "origin/$DEPLOY_BRANCH")"
[[ -n "$target_sha" ]] || target_sha="$branch_sha"
[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || fail "Invalid commit SHA."
[[ "$target_sha" == "$branch_sha" ]] || fail "Target is no longer the head of $DEPLOY_BRANCH."
[[ "$($REPO_DIR/scripts/check-ci.sh "$target_sha")" == green ]] || fail "CI gate is not green for $target_sha."

short_sha="${target_sha:0:12}"
previous_tag="$(cat "$STATE_DIR/deployed-tag" 2>/dev/null || true)"
if ((local_only)) && [[ -n "$previous_tag" ]]; then
  fail "--local-only is allowed only before the first recorded release."
fi
git -C "$REPO_DIR" checkout --quiet --detach "$target_sha" || fail "Could not check out $target_sha."

log "Building $short_sha."
IMAGE_TAG="$short_sha" GIT_SHA="$target_sha" compose build piano-web || fail "Image build failed; current release is untouched."
log "Switching to $short_sha."
if ! IMAGE_TAG="$short_sha" compose up -d --no-build piano-web; then
  rollback "$previous_tag"
  fail "Container failed to start."
fi
if ! wait_for_local; then
  rollback "$previous_tag"
  fail "Container health check failed."
fi
if ((local_only)); then
  log "Local first-start check passed; release is not recorded until public smoke passes."
  exit 0
fi
if ! wait_for_public "$target_sha"; then
  rollback "$previous_tag"
  fail "Public smoke check failed."
fi

printf '%s\n' "$short_sha" > "$STATE_DIR/deployed-tag"
printf '%s\n' "$target_sha" > "$STATE_DIR/deployed-sha"
{
  printf '%s\n' "$short_sha"
  if [[ -f "$STATE_DIR/tag-history" ]]; then grep -v "^$short_sha$" "$STATE_DIR/tag-history" || true; fi
} > "$STATE_DIR/tag-history.next"
mv "$STATE_DIR/tag-history.next" "$STATE_DIR/tag-history"
mapfile -t tags < "$STATE_DIR/tag-history"
if ((${#tags[@]} > 3)); then
  for old_tag in "${tags[@]:3}"; do docker image rm "piano-trainer:$old_tag" >/dev/null 2>&1 || true; done
  printf '%s\n' "${tags[@]:0:3}" > "$STATE_DIR/tag-history.next"
  mv "$STATE_DIR/tag-history.next" "$STATE_DIR/tag-history"
fi
log "Release $short_sha is live."
