#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REPO="https://github.com/RamjotSingh/typescript-sdk.git"
UPSTREAM_COMMIT="429e72bcdf02a6a3da76ab6f580e8986449553ab"
PNPM_VERSION="10.26.1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$ROOT/interop/mcp-subscription/gateAuthorityFixture.test.ts"
WORK="$(mktemp -d /tmp/gate-stage18a-mcp.XXXXXX)"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "=== GATE STAGE 18A MCP FIXTURE ==="
echo "Upstream: $UPSTREAM_REPO"
echo "Commit:   $UPSTREAM_COMMIT"

git clone \
  --quiet \
  --filter=blob:none \
  "$UPSTREAM_REPO" \
  "$WORK/typescript-sdk"

git -C "$WORK/typescript-sdk" \
  checkout --quiet --detach "$UPSTREAM_COMMIT"

ACTUAL_COMMIT="$(
  git -C "$WORK/typescript-sdk" rev-parse HEAD
)"

test "$ACTUAL_COMMIT" = "$UPSTREAM_COMMIT"

cp \
  "$FIXTURE" \
  "$WORK/typescript-sdk/packages/server/test/server/gateAuthorityFixture.test.ts"

cd "$WORK/typescript-sdk"

echo
echo "=== INSTALL ==="
npx --yes "pnpm@$PNPM_VERSION" install --frozen-lockfile

echo
echo "=== BUILD ==="
npx --yes "pnpm@$PNPM_VERSION" build:all

echo
echo "=== FIXTURE ==="
npx --yes "pnpm@$PNPM_VERSION" \
  --filter @modelcontextprotocol/server \
  exec vitest run \
  test/server/gateAuthorityFixture.test.ts \
  --reporter=verbose

echo
echo "=== RESULT ==="
echo "PASS Stage 18A provider-neutral MCP authority fixture"
echo "Pinned upstream commit: $ACTUAL_COMMIT"
