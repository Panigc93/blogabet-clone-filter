#!/usr/bin/env bash
# Local-only PostgreSQL harness. No TCP listener, credentials, services or URLs.
# PG_BIN=/path/to/postgres/bin PG_SHARE=/path/to/postgres/share \
#   bash scripts/test-bet2invest-postgres-local.sh [captureDir]
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to the directory containing initdb, pg_ctl and postgres}"
: "${PG_SHARE:?Set PG_SHARE to PostgreSQL shared files (postgres.bki directory)}"
root=$(mktemp -d /tmp/b2i-local-pg-XXXXXXXX)
chmod 700 "$root"
cleanup() {
  if [ -f "$root/data/postmaster.pid" ]; then
    "$PG_BIN/pg_ctl" -D "$root/data" -m fast -w stop || true
  fi
  rm -rf "$root"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$root/data" -A trust --no-locale --encoding=UTF8 -L "$PG_SHARE"
"$PG_BIN/pg_ctl" -D "$root/data" -l "$root/server.log" -o "-k $root -p 55439 -c listen_addresses=''" -w start
psql -h "$root" -p 55439 -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE b2i_executor_test'
export B2I_LOCAL_PG_SOCKET="$root"
if [ "${1:-}" ]; then export B2I_LOCAL_CAPTURE_DIR="$1"; else unset B2I_LOCAL_CAPTURE_DIR; fi
npx vitest run tests/crawler/bet2invest-postgres-local.test.ts
