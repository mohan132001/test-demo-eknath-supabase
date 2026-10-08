#!/usr/bin/env bash
# Apply supabase/migrations/*.sql to the Supabase Postgres running on this server.
# Usage (on the EC2 server, from the folder that contains supabase/migrations):
#   bash scripts/apply-migrations.sh                 # auto-detects the Supabase DB container
#   DB=openship-supabase-db bash scripts/apply-migrations.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
DB="${DB:-$(docker ps --format '{{.Names}}' | grep -E 'supabase.*-db$|supabase-db' | grep -v '^openship-postgres' | head -1)}"
[ -n "$DB" ] || { echo "No Supabase DB container found. Set DB=<container>"; exit 1; }
echo "Target DB container: $DB"
echo "Backup -> ~/supabase-backup-$(date +%F-%H%M).sql.gz"
docker exec "$DB" pg_dump -U postgres postgres | gzip > ~/supabase-backup-$(date +%F-%H%M).sql.gz
for f in "$DIR"/*.sql; do
  echo ">> $(basename "$f")"
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "Tables in public:"
docker exec "$DB" psql -U postgres -d postgres -c '\dt public.*'
