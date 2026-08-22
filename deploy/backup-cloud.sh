#!/usr/bin/env bash
# Nightly off-VM backup of NemoMemo Cloud data (registry + every reef).
# SQLite files are snapshotted with `.backup` (consistent even mid-write),
# then the staging dir + uploads are pushed to an encrypted restic repo.
#
# One-time setup on the VM:
#   apt-get install -y restic sqlite3
#   create /opt/nemomemo-deploy/backup.env with:
#     RESTIC_REPOSITORY=...   # e.g. b2:bucket:nemomemo-cloud or sftp:user@host:/backups
#     RESTIC_PASSWORD=...     # encryption passphrase — keep a copy OFF the VM
#     (+ provider credentials, e.g. B2_ACCOUNT_ID/B2_ACCOUNT_KEY)
#     HEALTHCHECK_URL=...     # optional ping (healthchecks.io) on success
#   restic init
#   install cron:  echo '17 7 * * * root /opt/nemomemo/deploy/backup-cloud.sh >> /opt/nemomemo-deploy/backup.log 2>&1' > /etc/cron.d/nemomemo-backup
set -Eeuo pipefail

ENV_FILE=/opt/nemomemo-deploy/backup.env
[[ -f $ENV_FILE ]] || { echo "missing $ENV_FILE — see header comment"; exit 1; }
set -a; source "$ENV_FILE"; set +a

DATA=$(docker volume inspect nemomemo-deploy_cloud-data --format '{{.Mountpoint}}')
STAGE=$(mktemp -d /tmp/nemomemo-backup.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

# Consistent SQLite snapshots: registry + every reef database.
while IFS= read -r db; do
  rel=${db#"$DATA"/}
  mkdir -p "$STAGE/$(dirname "$rel")"
  sqlite3 "$db" ".backup '$STAGE/$rel'"
done < <(find "$DATA" -name '*.db' -not -name '*.db-*')

# Uploads are plain files; hardlink-copy them into the same snapshot tree.
while IFS= read -r dir; do
  rel=${dir#"$DATA"/}
  mkdir -p "$STAGE/$rel"
  cp -al "$dir/." "$STAGE/$rel/" 2>/dev/null || cp -a "$dir/." "$STAGE/$rel/"
done < <(find "$DATA" -type d -name uploads)

restic backup --tag nemomemo-cloud "$STAGE"
restic forget --tag nemomemo-cloud --keep-daily 14 --keep-weekly 8 --prune

if [[ -n ${HEALTHCHECK_URL:-} ]]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || true
fi
echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') backup ok"
