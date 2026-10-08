#!/usr/bin/env bash
# Copy schema + data (incl. auth users) from an existing Supabase/Postgres into the Openship Supabase.
# Usage: SRC='postgresql://user:pass@host:5432/postgres' bash scripts/migrate-from-old-supabase.sh
set -euo pipefail
: "${SRC:?Set SRC to the source connection string}"
DB="${DB:-$(docker ps --format '{{.Names}}' | grep -E 'supabase.*-db$|supabase-db' | grep -v '^openship-postgres' | head -1)}"
OUT=~/sb-migrate; mkdir -p $OUT
echo "Source -> $OUT ; target container: $DB"
docker run --rm -v $OUT:/out postgres:17 sh -c "
  pg_dump '$SRC' --schema-only --no-owner --no-privileges -n public -f /out/schema.sql &&
  pg_dump '$SRC' --data-only --no-owner -n public -n auth -n storage \
     --exclude-table=auth.schema_migrations --exclude-table=storage.migrations -f /out/data.sql"
docker exec "$DB" pg_dump -U postgres postgres | gzip > ~/supabase-before-migrate-$(date +%F-%H%M).sql.gz
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < $OUT/schema.sql
( echo "SET session_replication_role = replica;"; cat $OUT/data.sql ) | docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1
docker exec "$DB" psql -U postgres -c "NOTIFY pgrst, 'reload schema';"
echo "Done. Users:"; docker exec "$DB" psql -U postgres -d postgres -c "select count(*) from auth.users;"
