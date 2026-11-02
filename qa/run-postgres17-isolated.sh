#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
container="gate-stage18-sql-qa-$$"
if ! command -v docker >/dev/null; then
 echo 'Docker is required for this disposable PostgreSQL 17 QA; no production connections are used.' >&2
 exit 2
fi
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Never expose the QA database on a host port and never send production keys.
docker run --name "$container" --rm -d -e POSTGRES_PASSWORD=ephemeral-only -e POSTGRES_DB=gate_qa postgres:17 >/dev/null
for i in $(seq 1 30); do
 if docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$container" pg_isready -U postgres -d gate_qa >/dev/null
sql(){ docker exec -i "$container" psql -X -U postgres -d gate_qa -v ON_ERROR_STOP=1 "$@"; }
sql < "$base/qa/fixture/00_fixture.sql"
sql < "$base/supabase/stage18-drafts/20261020_bounded_work_atomic_storage_DRAFT_v2.sql"
sql < "$base/qa/fixture/01_checks.sql"
# Two actual connections racing on the same work/sequence.
log_a="$(mktemp)"; log_b="$(mktemp)"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$log_a" "$log_b"; }
trap cleanup EXIT
sql < "$base/qa/fixture/02_concurrency_session_a.sql" > "$log_a" 2>&1 &
pid_a=$!
for i in $(seq 1 30); do
 if grep -q WORK_LOCKED "$log_a"; then break; fi
 sleep 0.1
done
if ! grep -q WORK_LOCKED "$log_a"; then echo 'Session A never locked work' >&2; cat "$log_a" >&2; exit 1; fi
set +e
sql < "$base/qa/fixture/03_concurrency_session_b.sql" > "$log_b" 2>&1
b_rc=$?
wait "$pid_a"
a_rc=$?
set -e
if [ "$a_rc" -ne 0 ] || [ "$b_rc" -eq 0 ] || ! grep -q 'bounded_work_sequence_gap_or_replay' "$log_b"; then
 echo 'CONCURRENCY QA FAILED' >&2
 cat "$log_a" "$log_b" >&2
 exit 1
fi
sql < "$base/qa/fixture/04_after_concurrency.sql"
echo 'PASS: one of two competing seq=1 transactions committed.'

# Force a second race: issuer row UPDATE commits revocation before ingress gets
# its FOR SHARE, so ingress must reject and MUST NOT write work or replay rows.
: > "$log_a"; : > "$log_b"
sql < "$base/qa/fixture/05_trust_revoke_session_a.sql" > "$log_a" 2>&1 &
pid_a=$!
for i in $(seq 1 30); do
 if grep -q ISSUER_LOCKED "$log_a"; then break; fi
 sleep 0.1
done
if ! grep -q ISSUER_LOCKED "$log_a"; then echo 'Session A never locked issuer' >&2; cat "$log_a" >&2; exit 1; fi
set +e
sql < "$base/qa/fixture/06_trust_revoke_session_b.sql" > "$log_b" 2>&1
b_rc=$?
wait "$pid_a"
a_rc=$?
set -e
if [ "$a_rc" -ne 0 ] || [ "$b_rc" -eq 0 ] || ! grep -q 'bounded_work_issuer_or_project_not_trusted' "$log_b"; then
 echo 'ISSUER REVOKE CONCURRENCY QA FAILED' >&2
 cat "$log_a" "$log_b" >&2
 exit 1
fi
sql < "$base/qa/fixture/07_after_trust_revoke.sql"
echo 'PASS: isolated PostgreSQL v2 QA, two races and rollback tests.'
