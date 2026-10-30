#!/usr/bin/env bash
# E2E runner: mock Neon HTTP + fixture tipsters, patched db/index.ts (temporary), production build.
# Safe: never touches real Neon/Blogabet. Requires: node 20+, npm deps installed, playwright + chrome.
set -euo pipefail
cd "$(dirname "$0")/../.."

MOCK_PORT=${MOCK_PORT:-4400}
APP_PORT=${E2E_APP_PORT:-3100}
export DATABASE_URL="postgresql://user:pass@localhost:${MOCK_PORT}/fake"
export SITE_PASSWORD=${SITE_PASSWORD:-test}
export AUTH_SECRET=${AUTH_SECRET:-test}

PIDS=()
cleanup() {
  kill "${PIDS[@]}" 2>/dev/null || true
  git checkout -- db/index.ts 2>/dev/null || true
}
trap cleanup EXIT

# 1) Temporary patch: db/index.ts fetchEndpoint override (reverted on exit, never commit)
python3 - <<PYEOF
import re
s = open('db/index.ts').read()
patched = s.replace(
  "import { neon } from '@neondatabase/serverless'",
  "import { neon, neonConfig } from '@neondatabase/serverless'\nneonConfig.fetchEndpoint = 'http://localhost:${MOCK_PORT}/sql'")
if patched == s:
    raise SystemExit('ERROR: db/index.ts anchor not found; update tests/e2e/run.sh patch')
open('db/index.ts','w').write(patched)
PYEOF

# 2) Build once with the patch
rm -rf .next/cache
npm run build >/tmp/e2e-build.log 2>&1 || { tail -30 /tmp/e2e-build.log; exit 1; }

wait_port() { for i in $(seq 1 60); do (exec 3<>"/dev/tcp/localhost/$1") 2>/dev/null && { exec 3>&- 3<&-; return; }; sleep 1; done; echo "port $1 not ready"; exit 1; }

# 3) Suite 1: normal fixtures
node tests/e2e/mock-neon.mjs & PIDS+=($!)
npm run start -- -p ${APP_PORT} >/tmp/e2e-server.log 2>&1 & PIDS+=($!)
wait_port ${MOCK_PORT}; wait_port ${APP_PORT}
node tests/e2e/verify.mjs

# 4) Suite 2: big fixtures (1200 tipsters)
kill "${PIDS[@]}" 2>/dev/null; wait "${PIDS[@]}" 2>/dev/null || true; PIDS=()
rm -rf .next/cache
MOCK_BIG=1 node tests/e2e/mock-neon.mjs & PIDS+=($!)
npm run start -- -p ${APP_PORT} >/tmp/e2e-server2.log 2>&1 & PIDS+=($!)
wait_port ${MOCK_PORT}; wait_port ${APP_PORT}
node tests/e2e/verify2.mjs

echo "E2E: all suites passed"
