#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
command -v docker >/dev/null || { echo 'Docker required; add Docker Desktop binary to PATH. No Supabase calls.' >&2; exit 2; }
command -v node >/dev/null || { echo 'Node 20+ required.' >&2; exit 2; }
container="gate-stage18-permit-$$"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Docker image may have been pulled previously; container has no network,
# published ports, host bind mounts or production credentials.
docker run --name "$container" --network none -d --rm \
 -e POSTGRES_PASSWORD=disposable-only -e POSTGRES_DB=gate_qa postgres:17 >/dev/null
for _ in $(seq 1 45); do
  docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null
sql(){ docker exec -i "$container" psql -X -q -U postgres -d gate_qa -v ON_ERROR_STOP=1; }
sql < qa/fixture/00_fixture.sql
sql < supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql
sql < supabase/stage18-drafts/20261021_bounded_work_read_boundary_DRAFT_v1.sql
sql < supabase/stage18-drafts/20261021_bounded_work_permit_reservation_DRAFT_v1.sql
STAGE18_DOCKER_CONTAINER="$container" node qa/run-permit-reservation-isolated.mjs
