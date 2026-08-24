#!/usr/bin/env bash
# Keep the Docker build cache from filling the VM disk.
#
# The auto-deploy poller rebuilds images on every push, and buildx keeps every
# layer it has ever built. On the containerd image store that cache lives in
# /var/lib/containerd (NOT /var/lib/docker), so `docker builder prune` and
# `docker system prune` reclaim almost nothing — `docker buildx prune` is the
# one that works. Left alone it grew ~28 GB and filled a 30 GB disk three days
# running, and the only symptom was `FAILED` lines in update.log while the demo
# quietly kept serving the previous version.
#
# Age is the lever that actually works here. `--max-used-space` looks like the
# right flag and is silently a no-op on the default docker driver (measured:
# 16.65 GB cache, 10 GB cap, 0 B reclaimed) because it is a buildkitd GC policy
# the daemon's embedded builder ignores. `--filter until=` is honoured — the
# same box reclaimed 12.97 GB with it — so that is what this uses.
#
# Two passes:
#   1. Drop cache older than the retention window. Recent layers stay warm, so
#      the next build is still fast.
#   2. If free disk is *still* under the floor, empty the cache outright.
#      Slower next build, but the disk is what actually matters, and this way
#      the job cannot fail quietly the way the last three outages did.
#
# Nothing here touches images, containers or volumes — only build cache, which
# is regenerable by definition.
#
# Install (daily at 04:30 UTC — quiet, and well clear of the 07:17 backup and
# the 09:00 demo reset):
#   echo '30 4 * * * root /opt/nemomemo/deploy/prune-build-cache.sh >> /opt/nemomemo-deploy/prune.log 2>&1' > /etc/cron.d/nemomemo-prune
#
# Tunables: NEMOMEMO_CACHE_RETENTION (default 24h), NEMOMEMO_MIN_FREE_GB (15).
set -Eeuo pipefail

RETENTION="${NEMOMEMO_CACHE_RETENTION:-24h}"
MIN_FREE_GB="${NEMOMEMO_MIN_FREE_GB:-15}"

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
cache_size() { docker system df 2>/dev/null | awk '/^Build Cache/ {print $(NF-1)}'; }
free_gb() { df -BG --output=avail / | awk 'NR==2 {gsub(/G/,""); print $1+0}'; }
report() { echo "  cache $(cache_size), $(free_gb)G free of $(df -h / | awk 'NR==2 {print $2}')"; }

echo "$(stamp) prune start"
report

# Pass 1 — evict by age, keeping recent layers warm.
docker buildx prune -af --filter "until=$RETENTION" 2>&1 | tail -1 | sed 's/^/  reclaimed: /' \
  || echo "  (aged prune failed; continuing)"

free_now="$(free_gb)"
if [ "$free_now" -lt "$MIN_FREE_GB" ]; then
  echo "  only ${free_now}G free (floor ${MIN_FREE_GB}G) — emptying the cache instead"
  docker buildx prune -af 2>&1 | tail -1 | sed 's/^/  reclaimed: /' || echo "  (full prune failed)"
fi

echo "$(stamp) prune done"
report
