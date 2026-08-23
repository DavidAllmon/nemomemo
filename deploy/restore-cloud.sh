#!/usr/bin/env bash
# Host-side half of the in-app snapshot browser (spec:
# docs/superpowers/specs/2026-08-23-cloud-snapshot-browser-design.md).
# Cron runs this every minute. It services restore requests the cloud app
# queues as files, using the restic creds that live ONLY on the host:
#   queue/<slug>.json -> restic restore -> integrity check -> staged/<slug>/
# The app's sweeper does the actual swap; this script never touches reefs/.
set -Eeuo pipefail

ENV_FILE=/opt/nemomemo-deploy/backup.env
[[ -f $ENV_FILE ]] || exit 0
set -a; source "$ENV_FILE"; set +a

# One run at a time; a crashed run's .working files are requeued next minute.
exec 9>/var/lock/nemomemo-restore.lock
flock -n 9 || exit 0

DATA=$(docker volume inspect nemomemo-deploy_cloud-data --format '{{.Mountpoint}}')
QUEUE="$DATA/restore/queue"; STATUS="$DATA/restore/status"
STAGED="$DATA/restore/staged"; TMPROOT="$DATA/restore/tmp"
[[ -d $QUEUE ]] || exit 0
mkdir -p "$STATUS" "$STAGED" "$TMPROOT"
shopt -s nullglob

set_status() { # slug state [message] — merges over the app-written request fields
  local slug=$1 state=$2 message=${3:-}
  jq -n --argjson prev "$(cat "$STATUS/$slug.json" 2>/dev/null || echo '{}')" \
        --arg state "$state" --arg message "$message" --argjson now "$(date +%s)" \
        '$prev + {state: $state, updatedTs: $now}
         + (if $message == "" then {} else {message: $message} end)' \
    > "$STATUS/$slug.json.tmp" && mv "$STATUS/$slug.json.tmp" "$STATUS/$slug.json"
}

# Requeue leftovers from a crashed run (we hold the lock, so none are live).
for stale in "$QUEUE"/*.working; do mv "$stale" "${stale%.working}"; done

for req in "$QUEUE"/*.json; do
  slug=$(basename "$req" .json)
  [[ $slug =~ ^[a-z0-9](-?[a-z0-9]){0,39}$ ]] || { rm -f "$req"; continue; }
  work="$req.working"; mv "$req" "$work"
  snap=$(jq -r '.snapshotId // empty' "$work")
  if [[ ! $snap =~ ^[0-9a-f]{8,64}$ ]]; then
    set_status "$slug" failed "That restore request made no sense — try again from Settings"
    rm -f "$work"; continue
  fi

  set_status "$slug" restoring
  tmp="$TMPROOT/$slug"; rm -rf "$tmp"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') restoring $slug from $snap"
  if ! restic restore "$snap" --target "$tmp" --include "*/reefs/$slug"; then
    set_status "$slug" failed "We couldn't pull that snapshot back — try another date, or reach out"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi
  dir=$(find "$tmp" -type d -path "*/reefs/$slug" | head -1)
  if [[ -z $dir || ! -f $dir/nemomemo.db ]]; then
    set_status "$slug" failed "That snapshot has no copy of this reef — pick a later date"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi
  if [[ $(sqlite3 "$dir/nemomemo.db" 'PRAGMA integrity_check;') != ok ]]; then
    set_status "$slug" failed "The snapshot failed its health check — nothing was changed"
    rm -rf "$tmp"; rm -f "$work"; continue
  fi

  rm -rf "${STAGED:?}/$slug"
  mv "$dir" "$STAGED/$slug"   # same filesystem as the volume: atomic
  set_status "$slug" staged
  rm -rf "$tmp"; rm -f "$work"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') staged $slug from $snap — app will swap it in"
done
