# Bettingexpert insert preparation, 18 November 2026

Local only. No network adapter, production connection, CLI dispatch, schema change or automatic execution. Capture and period work remain separate.

## Evidence

9,211 captured missing-global-ranking profiles, 1,536 saved responses, each identity checked against the original discovery catalogue. These are parsed GraphQL response objects retained at capture time, not original HTTP bytes or headers. Response checksums use Node JSON.stringify. Full batch-file checksums are byte-exact. Original HTTP text was not retained after JSON.parse.

This dataset does not include a refreshed all-time capture for the 4,307 profiles already in the general ranking. Sports ranking numbers must not substitute for their global totals. The source catalogue remains a separate discovery snapshot.

## Insert-only protocol

`crawler/platforms/bettingexpert/import.ts` accepts at most 250 verified records per atomic transaction. Caller supplies database transaction and authority. Preflight only SELECTs; no sequence allocation happens in preflight. Executor takes a NOWAIT table lock, applies lock/statement timeouts, rechecks exact identity and case variants, then allocates real internal IDs from the existing manual sequence inside the transaction. No GUID-derived or max(id)+1 IDs. Existing identities fail closed, including a replay, rather than overwriting newer rows.

Each inserted row has same-transaction audit in existing import_validation_log: source GUID, exact username, unit, scope, capture time, batch digest, code revision and run ID. No schema addition. Unknown since/activity/followers remain null, and period fields remain null. No ON CONFLICT overwrite, no updates or deletes. A future executor must retain chunk receipts and reconcile a lost acknowledgement before deciding whether another transaction is needed. Sequence gaps after rollback are expected.

The table lock blocks other writers briefly. Local timing is not a production timing guarantee. No live execution until a fresh preflight confirms manual sequence existence/configuration/current position, schema and existing identities, code review, and production authority. Do not infer a reserved ID from this snapshot.

## Case-sensitive identities

FirefoxX/Firefoxx and unstoppable/Unstoppable have distinct source GUIDs and figures. PostgreSQL unique(platform,slug) is case sensitive. No merge or lowercase canonicalization. Group case variants together in a planned chunk; a case variant already in DB blocks the chunk for review. Exact profile URL construction preserves username case. External site routing equivalence for these four names has not been tested, so source navigation remains a review item. UI rendering shows all four separately.

## Local full-dataset rehearsal

`scripts/bettingexpert-local-import.ts` uses in-memory PGlite only, groups case variants, runs 37 chunks and verifies every identity, picks, unit, own capture time and null periods. Five other-platform sentinels are unchanged. Same-transaction audit has 9,211 rows. Separate tests exercise rollback after a mid-transaction failure and rejection of replay/provenance mismatch. There is no remote adapter in this deliverable.

Measured storage change over all 9,211 rows: profit numeric(12,3) changes 139 rows, max absolute error 0.0005 pt BE. Yield numeric(6,2) changes 6,917 rows, max absolute error 0.005 percentage points. This is storage rounding, not total source measurement uncertainty. Raw source precision remains in capture evidence. Display uses up to 3 decimals for BE profit and 2 for yield, avoiding an extra profit rounding step.

## Current integration

Reconciled locally with master 57351da29ce3ee4d6db72ac084cc928613e580cf. Preserve B2I anchor/409/audit read and OLBG activation/revision/projection paths. BE periods masked before pagination and defensively in API/card. BE profit remains its own unit, combined profit sorting groups units rather than comparing them as money.

Production remains blocked on independent review, live sequence preflight, final scope and authority. Period collector is not started by this code and is not imported here.
