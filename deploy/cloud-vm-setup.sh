#!/usr/bin/env bash
# One-time NemoMemo Cloud setup on the deploy VM. Idempotent; safe to re-run.
# Run on the VM:  bash /opt/nemomemo/deploy/cloud-vm-setup.sh
set -Eeuo pipefail

DEPLOY=/opt/nemomemo-deploy
COMPOSE=$DEPLOY/docker-compose.yml

# --- cloud.env (created only if missing; holds the Stripe secrets you add) ---
if [[ ! -f $DEPLOY/cloud.env ]]; then
  cat > "$DEPLOY/cloud.env" <<'EOF'
NEMOMEMO_CLOUD=1
NEMOMEMO_CLOUD_DOMAIN=trynemomemo.com
NEMOMEMO_CLOUD_APP_HOST=app.trynemomemo.com
# Stripe TEST-mode keys — fill these in, then:
#   docker compose -f /opt/nemomemo-deploy/docker-compose.yml up -d cloud
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_MONTHLY_ID=price_1U7FiwLS7PjlEWsLOBx1NVKn
# STRIPE_PRICE_YEARLY_ID=price_1U7Fj1LS7PjlEWsLrCbAGrXQ
EOF
  chmod 600 "$DEPLOY/cloud.env"
  echo "wrote $DEPLOY/cloud.env"
fi

# --- compose: add the cloud service (own container, own volume) ---
if ! grep -q '^  cloud:' "$COMPOSE"; then
  cp "$COMPOSE" "$COMPOSE.bak-precloud"
  python3 - "$COMPOSE" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
service = """  cloud:
    build:
      context: /opt/nemomemo
      dockerfile: Dockerfile
    ports: ["5231:5230"]
    volumes: ["cloud-data:/app/data"]
    env_file: [/opt/nemomemo-deploy/cloud.env]
    restart: unless-stopped
"""
text = text.replace("  site:", service + "  site:", 1)
text = text.replace("volumes:\n  demo-data: {}", "volumes:\n  demo-data: {}\n  cloud-data: {}", 1)
open(path, "w").write(text)
EOF
  echo "patched $COMPOSE"
fi

# --- updater: app changes rebuild cloud alongside demo ---
if ! grep -q 'services+=(demo cloud)' "$DEPLOY/update.sh"; then
  cp "$DEPLOY/update.sh" "$DEPLOY/update.sh.bak-precloud"
  sed -i 's/(( demo )) && services+=(demo)/(( demo )) \&\& services+=(demo cloud)/' "$DEPLOY/update.sh"
  echo "patched $DEPLOY/update.sh"
fi

docker compose -f "$COMPOSE" config --quiet
docker compose -f "$COMPOSE" up -d --build cloud

sleep 3
curl -sf -H 'Host: app.trynemomemo.com' http://localhost:5231/healthz \
  && echo " — cloud container healthy on :5231 🌊" \
  || { echo "cloud healthcheck FAILED — check: docker compose -f $COMPOSE logs cloud"; exit 1; }
