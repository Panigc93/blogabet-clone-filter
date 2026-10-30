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

TARGET=db/index.ts

# Safety: refuse to run if the target has ANY uncommitted state (staged or unstaged).
# We patch this file temporarily and restore it; we must never clobber user work.
if [ -n "$(git status --porcelain -- "$TARGET")" ]; then
  echo "ERROR: $TARGET tiene cambios sin commitear (staged o no)." >&2
  echo "El runner lo parchea temporalmente y no puede arriesgar tu trabajo." >&2
  echo "Haz commit o stash de esos cambios y vuelve a intentarlo." >&2
  exit 1
fi

# Backup the exact original bytes BEFORE any mutation; the trap only restores
# from this backup, never from git, so restoration is byte-exact.
BACKUP=$(mktemp /tmp/e2e-dbindex-backup.XXXXXX)
cp "$TARGET" "$BACKUP"

PIDS=()
cleanup() {
  kill "${PIDS[@]}" 2>/dev/null || true
  cat "$BACKUP" > "$TARGET"   # restore exact original bytes, keep inode/perms
  rm -f "$BACKUP"
}
trap cleanup EXIT

# 1) Temporary patch: db/index.ts fetchEndpoint override (restored on exit, never commit)
python3 - <<PYEOF
s = open('$TARGET').read()
patched = s.replace(
  "import { neon } from '@neondatabase/serverless'",
  "import { neon, neonConfig } from '@neondatabase/serverless'\nneonConfig.fetchEndpoint = 'http://localhost:${MOCK_PORT}/sql'")
if patched == s:
    raise SystemExit('ERROR: $TARGET anchor not found; update tests/e2e/run.sh patch')
open('$TARGET','w').write(patched)
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
