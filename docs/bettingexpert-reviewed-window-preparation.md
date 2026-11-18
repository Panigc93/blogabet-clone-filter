# Bettingexpert: offline reviewed window preparation

This candidate adds no database, source, activation or deployment call. It preserves existing SQL/API/read gates and the Overall importer. Bulk captures and the exact reviewed selection remain in the separate private review bundle, not git.

## Reproduction

From repository root, with the private bundle unpacked outside git:

```sh
npx tsx scripts/bettingexpert-prepare-reviewed-windows.ts /private/bundle/manifest.json /private/bundle /private/new-output.json
```

The output path must not exist. Preparation reads exact staged bytes, checks each SHA-256, GUID, slug and capture month, runs the existing staged receipt validator, checks the reviewed row/window totals, and round-trips the existing checksum index codec. The encoded index is compatible with the existing injected activation adapter, but this script never calls it. Hashes prove custody only, not source authenticity, approval or completeness.

The November review has 18 profiles, 48 accepted windows and six explicitly unresolved windows. A separate full-catalogue coverage file records every absent window. There is no synthetic audit for a missing identity and no zero substitution. Production display also requires the exact matching accepted Overall GUID/capture and the existing current-month, revision and nonfuture checks. The five additional Overall profiles are separate input, not an automatic extension of the original 13,517 records.

## Meaning shown in the card

Overall remains the source-published global figure. Periods are reconstructed cohorts by publication date over completed UTC calendar months. Yield is captured closed-ledger net profit divided by advised stake, times 100. Count and net profit reconcile with captured ranking differences. This is not native source monthly yield, competition settlement-month accounting or a universal statement about source date semantics. No explicit settlement date, universal source completeness or atomic snapshot has been established.

The visible changes are one BE-specific explanatory line under existing period cells, including the final UTC month and denominator; an explicit Apuestas/mes 6m label for the rounded closed-pick monthly average; and a full-width mobile profit cell to avoid clipping long BE point totals. Existing per-cell hover/accessibility text carries exact start/end months, sample, numerator, denominator and capture time. Missing cells remain dashes; a profile without accepted periods has no period row. Other platform presentation is unchanged. No audit table, extra control, or collection action is added.

## Review evidence

Tests exercise 18/48 with synthetic inputs, byte tampering, missing/duplicate/wrong identity, month/count gates, held-window NULLs and BE-specific card meaning. The private bundle contains exact real receipts and full-catalogue coverage cross-check results, not merely the synthetic test. SQL-before-pagination and provenance masking regression is retained. Desktop/mobile screenshots are offline actual-component renders with real accepted and held examples; they are not proof of a production import.

No network checkpoint/resource behavior is changed in this patch. No API operator message was sent. Deployment, merging, database import and activation remain out of scope.
