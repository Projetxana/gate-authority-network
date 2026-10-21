#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
cd "$base"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required. Nothing touched on Supabase.' >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node 20+ required.' >&2
  exit 2
fi
container="gate-stage18-e2e-$$"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No exposed TCP port, no secrets from environment, no Supabase network.
docker run --name "$container" -d --rm \
 -e POSTGRES_PASSWORD=ephemeral-only -e POSTGRES_DB=gate_qa \
 postgres:17 >/dev/null
for i in $(seq 1 45); do
 if docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null
sql(){ docker exec -i "$container" psql -X -U postgres -d gate_qa -v ON_ERROR_STOP=1 "$@"; }
sql < qa/fixture/00_fixture.sql
# The prior v2 file contains a previously identified PostgreSQL function-prefix
# typo on some installs; check it instead of quietly fixing a production script.
if grep -q 'pg_catalog\.coalesce(' supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql; then
 echo 'Run prior correction: sed -i '\''\x27\x27'\'' '\''s/pg_catalog\\.coalesce(/coalesce(/g'\'' file.sql' >&2
 exit 2
fi
sql < supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql
sql < supabase/stage18-drafts/20261021_bounded_work_read_boundary_DRAFT_v1.sql
STAGE18_DOCKER_CONTAINER="$container" node qa/run-bounded-work-e2e.mjs
