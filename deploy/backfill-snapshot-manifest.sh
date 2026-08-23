#!/usr/bin/env bash
# One-time: give pre-manifest snapshots their reef lists so history shows up
# in the in-app snapshot browser. Safe to re-run (only fills null entries).
set -Eeuo pipefail
set -a; source /opt/nemomemo-deploy/backup.env; set +a
DATA=$(docker volume inspect nemomemo-deploy_cloud-data --format '{{.Mountpoint}}')
MANIFEST="$DATA/snapshots.json"
PREV=$(cat "$MANIFEST" 2>/dev/null || echo '[]')
OUT='[]'
while read -r short time; do
  reefs=$(jq -c --arg id "$short" 'map(select(.id == $id)) | .[0].reefs // null' <<<"$PREV")
  if [[ $reefs == null ]]; then
    reefs=$(restic ls "$short" 2>/dev/null | grep -oE '/reefs/[a-z0-9-]+/' \
      | sed 's#/reefs/##; s#/##' | sort -u | jq -R . | jq -sc .)
    [[ -z $reefs ]] && reefs='[]'
  fi
  OUT=$(jq -c --arg id "$short" --arg time "$time" --argjson reefs "$reefs" \
    '. + [{id: $id, time: $time, reefs: $reefs}]' <<<"$OUT")
done < <(restic snapshots --tag nemomemo-cloud --json | jq -r 'sort_by(.time) | reverse | .[] | "\(.short_id) \(.time)"')
jq . <<<"$OUT" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
echo "manifest holds $(jq length <<<"$OUT") snapshots"
