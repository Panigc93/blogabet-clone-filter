# Stats report counters

Review-only correction. No change to scraping, request cadence, selected
cohort, stop/retry policy, data writes, checkpoint format, clear policy or
workflow. No claim of a rerun or retroactive reconciliation.

`done` is a legacy cumulative counter restored from checkpoint. The loop
increments it on parsed stats AND ordinary HTTP200 pages with no parseable
data. It is not a count of updated rows. `errors` may also include a prior
checkpoint. They remain unchanged for checkpoint compatibility.

New per-invocation counters are emitted only from observed execution:
- processed: completed items = refreshed + noData + requestErrors.
- refreshed: parsed results whose write callback completed successfully.
- noData: ordinary non-challenge response parsed to null.
- requestErrors: ordinary fetch/parse failures, not terminal denied/challenge.
- checkpointOffset/Done/Errors: exactly what was restored at invocation start.

A terminal denied response stops the loop and is not classified as completed
or noData. Remaining items are never classified by subtraction. A thrown
write still fails immediately as before: no invented success summary.

Removed the formula withStats-done. Neither counter identifies rows retained
by this invocation. `withStats` is now labeled as rows with non-null stats
timestamp after the run, explicitly not count updated or retained. It does
not mean all yield fields are non-null.

This fixes future reporting; it does not prove why run43850745559 logged3161
processed while a later SELECT found3000 timestamps today. In particular,
161 no-data is only one compatible explanation and is NOT recorded as fact.
The old131 retained message is a flawed derived count, not audited row truth.

Tests are offline with injected functions and no real sources/DB. Dedicated
coverage includes checkpoint+mixed outcomes, no-data stop, denied response,
all writes, unchanged control decisions. Base master0aac60c has a separate
known suite issue: import-tipstrr-prod.ts runs main on import in two tests,
causing two unhandled process.exit errors without DATABASE_URL. That fix
lives in pending PR14, not this reporting PR. No real credentials are used
to silence it.
