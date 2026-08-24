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
# This caps the cache instead of emptying it: --max-used-space keeps the most
# recently used layers up to the cap, so the next build is still warm.
#
# Install (daily at 04:30 UTC — quiet, and well clear of the 07:17 backup and
# the 09:00 demo reset):
#   echo '30 4 * * * root /opt/nemomemo/deploy/prune-build-cache.sh >> /opt/nemomemo-deploy/prune.log 2>&1' > /etc/cron.d/nemomemo-prune
#
# Override the cap with NEMOMEMO_CACHE_CAP (any value buildx accepts, e.g. 6GB).
set -Eeuo pipefail

CAP="${NEMOMEMO_CACHE_CAP:-10GB}"

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
cache_size() { docker system df 2>/dev/null | awk '/^Build Cache/ {print $(NF-1), $NF}'; }
disk_free() { df -h / | awk 'NR==2 {print $4" free of "$2" ("$5" used)"}'; }

echo "$(stamp) prune start — cache $(cache_size), disk $(disk_free)"

# -a includes internal/frontend cache; without it a large chunk survives.
docker buildx prune -af --max-used-space "$CAP"

echo "$(stamp) prune done  — cache $(cache_size), disk $(disk_free)"
