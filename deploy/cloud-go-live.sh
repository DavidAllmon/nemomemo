#!/usr/bin/env bash
# Flip NemoMemo Cloud from Stripe test mode to LIVE. Idempotent; safe to re-run.
#
#   bash /opt/nemomemo/deploy/cloud-go-live.sh sk_live_...   [--force-no-backups]
#
# What it does, in order:
#   1. Gate: refuses unless off-VM backups are configured and have run once
#      (the launch rule), unless --force-no-backups is passed deliberately.
#   2. Ensures the LIVE product + $1.99/mo + $19/yr prices exist (by lookup key).
#   3. Recreates the LIVE webhook endpoint (secret is only revealed on creation).
#   4. Deletes the TEST webhook endpoint so it doesn't rot with signature failures.
#   5. Rewrites cloud.env with the live key/secret/price ids, restarts the
#      cloud container, and verifies checkout now produces cs_live_ sessions.
set -Eeuo pipefail

DEPLOY=/opt/nemomemo-deploy
ENV_FILE=$DEPLOY/cloud.env
WEBHOOK_URL="https://app.trynemomemo.com/cloud/webhook/stripe"
LIVE_KEY=${1:-}
FORCE=${2:-}

[[ $LIVE_KEY == sk_live_* ]] || { echo "usage: cloud-go-live.sh sk_live_... [--force-no-backups]"; exit 1; }

# --- 1. The backup gate -------------------------------------------------------
if [[ $FORCE != "--force-no-backups" ]]; then
  if [[ ! -f $DEPLOY/backup.env ]] || ! (set -a; source $DEPLOY/backup.env; set +a; restic snapshots --latest 1 >/dev/null 2>&1); then
    echo "REFUSING: off-VM backups are not configured/verified ($DEPLOY/backup.env + one"
    echo "successful restic snapshot). That was the launch rule: real customers' reefs"
    echo "must not live on one disk. See deploy/backup-cloud.sh — or re-run with"
    echo "--force-no-backups if you truly accept the risk."
    exit 1
  fi
fi

api() { # api METHOD PATH [curl -d args...]   (-g: Stripe URLs contain literal [])
  local method=$1 path=$2; shift 2
  curl -sSg -X "$method" "https://api.stripe.com/v1/$path" -u "$LIVE_KEY:" "$@"
}
jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }

# --- 2. Live product + prices (idempotent via lookup keys) --------------------
MONTH_ID=$(api GET "prices?lookup_keys[]=nemomemo_cloud_monthly&limit=1" | jget "d['data'][0]['id'] if d['data'] else ''")
YEAR_ID=$(api GET "prices?lookup_keys[]=nemomemo_cloud_yearly&limit=1" | jget "d['data'][0]['id'] if d['data'] else ''")
if [[ -z $MONTH_ID || -z $YEAR_ID ]]; then
  PRODUCT_ID=$(api GET "products/search" -G --data-urlencode "query=metadata['app']:'nemomemo-cloud'" --data-urlencode "limit=1" | jget "d['data'][0]['id'] if d['data'] else ''")
  if [[ -z $PRODUCT_ID ]]; then
    PRODUCT_ID=$(api POST products \
      -d "name=NemoMemo Cloud" \
      -d "description=Your own private reef — hosted NemoMemo, unlimited memos, just keep swimming." \
      -d "tax_code=txcd_20030000" \
      -d "metadata[app]=nemomemo-cloud" | jget "d['id']")
    echo "created live product $PRODUCT_ID"
  fi
  [[ -n $MONTH_ID ]] || MONTH_ID=$(api POST prices -d "product=$PRODUCT_ID" -d currency=usd -d unit_amount=199 \
    -d "recurring[interval]=month" -d "lookup_key=nemomemo_cloud_monthly" -d "nickname=NemoMemo Cloud monthly" | jget "d['id']")
  [[ -n $YEAR_ID ]] || YEAR_ID=$(api POST prices -d "product=$PRODUCT_ID" -d currency=usd -d unit_amount=1900 \
    -d "recurring[interval]=year" -d "lookup_key=nemomemo_cloud_yearly" -d "nickname=NemoMemo Cloud yearly" | jget "d['id']")
fi
echo "live prices: month=$MONTH_ID year=$YEAR_ID"
[[ $MONTH_ID == price_* && $YEAR_ID == price_* ]] || { echo "FAILED to resolve live prices"; exit 1; }

# --- 3. Live webhook endpoint (recreate: the secret only shows once) ----------
for id in $(api GET "webhook_endpoints?limit=100" | jget "'\n'.join(w['id'] for w in d['data'] if w['url']=='$WEBHOOK_URL')"); do
  api DELETE "webhook_endpoints/$id" >/dev/null && echo "removed old live webhook $id"
done
WEBHOOK_JSON=$(api POST webhook_endpoints \
  -d "url=$WEBHOOK_URL" \
  -d "description=NemoMemo Cloud (live)" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "enabled_events[]=customer.subscription.deleted")
WEBHOOK_ID=$(echo "$WEBHOOK_JSON" | jget "d['id']")
WEBHOOK_SECRET=$(echo "$WEBHOOK_JSON" | jget "d['secret']")
[[ $WEBHOOK_SECRET == whsec_* ]] || { echo "FAILED to create live webhook"; exit 1; }
echo "live webhook: $WEBHOOK_ID"

# --- 4. Retire the TEST webhook endpoint --------------------------------------
OLD_TEST_KEY=$(grep '^STRIPE_SECRET_KEY=sk_test_' "$ENV_FILE" | cut -d= -f2 || true)
if [[ -n $OLD_TEST_KEY ]]; then
  for id in $(curl -sS "https://api.stripe.com/v1/webhook_endpoints?limit=100" -u "$OLD_TEST_KEY:" \
      | jget "'\n'.join(w['id'] for w in d['data'] if w['url']=='$WEBHOOK_URL')"); do
    curl -sS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$id" -u "$OLD_TEST_KEY:" >/dev/null \
      && echo "removed test webhook $id"
  done
fi

# --- 5. Swap env, restart, verify ---------------------------------------------
cp "$ENV_FILE" "$ENV_FILE.bak-test-mode"
grep -v '^STRIPE_\|^# STRIPE_' "$ENV_FILE" > "$ENV_FILE.new"
{
  echo "STRIPE_SECRET_KEY=$LIVE_KEY"
  echo "STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "STRIPE_PRICE_MONTHLY_ID=$MONTH_ID"
  echo "STRIPE_PRICE_YEARLY_ID=$YEAR_ID"
} >> "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"
chmod 600 "$ENV_FILE"
docker compose -f $DEPLOY/docker-compose.yml up -d cloud
sleep 4

curl -sf -H 'Host: app.trynemomemo.com' http://localhost:5231/healthz >/dev/null || { echo "healthz FAILED"; exit 1; }
REDIRECT=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: app.trynemomemo.com' "http://localhost:5231/cloud/checkout?interval=month")
case $REDIRECT in
  *checkout.stripe.com/c/pay/cs_live_*) echo "checkout verified LIVE: ${REDIRECT:0:60}...";;
  *) echo "checkout did NOT return a live session: $REDIRECT"; exit 1;;
esac

echo
echo "🌊 NemoMemo Cloud is LIVE. Final sanity ritual (recommended):"
echo "   buy one \$1.99 month with a real card, claim a reef, then refund"
echo "   yourself in the Stripe dashboard (Payments → refund)."
