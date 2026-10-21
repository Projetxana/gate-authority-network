#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
cd "$base"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required; add Docker Desktop bin to PATH. Supabase untouched.' >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node 20+ is required.' >&2
  exit 2
fi
container="gate-stage18-guarded-$$"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No host ports, no volumes with credentials and no Supabase API access.
docker run --name "$container" --network none -d --rm \
  -e POSTGRES_PASSWORD=isolated-test-only -e POSTGRES_DB=gate_qa \
  postgres:17 >/dev/null
for i in $(seq 1 45); do
  if docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null
sql(){ docker exec -i "$container" psql -X -U postgres -d gate_qa -v ON_ERROR_STOP=1 "$@"; }
sql < qa/fixture/00_fixture.sql
if grep -q 'pg_catalog\.coalesce(' supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql; then
  echo 'Fix the previous draft coalesce typo before rerunning.' >&2; exit 2
fi
sql < supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql
sql < supabase/stage18-drafts/20261021_bounded_work_read_boundary_DRAFT_v1.sql
sql < supabase/stage18-drafts/20261021_bounded_work_guarded_effect_DRAFT_v1.sql
STAGE18_DOCKER_CONTAINER="$container" node qa/run-guarded-db-effect-isolated.mjs
