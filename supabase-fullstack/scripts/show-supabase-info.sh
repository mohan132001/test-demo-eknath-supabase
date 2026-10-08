#!/usr/bin/env bash
# Print what the app needs from the Supabase stack (keys are masked unless SHOW=1).
set -euo pipefail
KONG=$(docker ps --format '{{.Names}}' | grep -E 'supabase-kong|kong' | head -1)
AUTH=$(docker ps -a --format '{{.Names}}' | grep -E 'supabase-auth' | head -1)
echo "Kong container : ${KONG:-not found}"
docker ps --format '{{.Names}}  {{.Status}}  {{.Ports}}' | grep -E 'supabase' || true
mask(){ if [ "${SHOW:-0}" = 1 ]; then cat; else sed -E 's/(=.{12}).*/\1…(masked; SHOW=1 to reveal)/'; fi; }
echo; echo "== keys (from $KONG) =="
docker exec "$KONG" sh -c 'env | grep -E "^SUPABASE_ANON_KEY=|^SUPABASE_SERVICE_KEY="' | mask || true
echo; echo "== auth public URLs =="
docker exec "$AUTH" sh -c 'env | grep -E "^API_EXTERNAL_URL=|^GOTRUE_SITE_URL=|^GOTRUE_URI_ALLOW_LIST="' 2>/dev/null || echo "(auth container not running — check: docker logs $AUTH --tail 20)"
