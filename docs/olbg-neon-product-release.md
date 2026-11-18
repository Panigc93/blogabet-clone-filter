# Recommended release: existing Neon, normal Git deployments

Local candidate only. No Neon write, Vercel configuration, upload, merge or deployment is authorized or completed by this document. This route supersedes the prebuilt artifact delivery proposal in the earlier candidate notes.

## Product and private evidence are separate

The retained private captures and their per-input hashes are not application build inputs. They stay outside Git and outside static hosting. The product projection contains only the profile identity, approved avatar, registration/capture dates, source URL and monthly published values plus their displayed numeric strings. Those strings are necessary for the existing source-checkable Historial. It excludes full responses, HTML, private paths, credentials, and the inputSha256 index.

The pinned product has561profiles/6020months,993468 UTF-8 bytes. Product revision:

`5a15858f11e147d388bbd1e92e06e58dcb9a424f4da72c6cec4a62e11f04b28b`

Raw-source snapshot SHA and product revision intentionally differ. No performance estimate is stored as an exact observed yield. Approved estimator and UI code are unchanged.

## Small additive change

- New isolated `olbg_published_snapshots` table with a row per exact revision, version, counts, payload text and import time. No new service, account, extension, database or branch. No UPDATE/DELETE to tipsters, no legacy OLBG overwrite, no other-platform changes.
- Text payload deliberately preserves exact bytes so the application reuses SHA verification. At this size a single object is simpler than a new normalized relational importer. Its entire object is needed by the current common-list engine anyway. Splitting it into tables would not remove the separate11MB baseline transfer.
- Git stores a tiny manifest only. Production SELECTs that exact revision, never an automatic latest row. Missing/corrupt rows fail closed. Hashes and counts are checked on every read; normal privileges do not make this physically immutable, but unauthorized alteration cannot silently pass the read guard.
- Production no longer reads FILE/SHA environment variables or packages private data. The file adapter remains only for local labs/tests. No static/raw/snapshot endpoint is added. Ordinary Git redeploys remain ordinary Git redeploys.
- Existing production release flag remains OFF by default, separate from labs/legacy activation. No variable was changed. Before enabling, importing the pinned row must finish and verify.
- Query baseline is still one coherent SELECT per request with fresh digest/cursor checks. Monthly product read has its own immutable revision contract. No TTL cache or monitor added.

## Audience

Home currently requires authentication. The existing listing API does not. With the release flag ON, derived OLBG cards and Historial would also be returned from that existing unauthenticated API. The raw archive is not published. Do not describe this as an authenticated-only OLBG release. Changing API authentication is a separate product decision, not part of this delta.

## Permission still required

Ask Juan for this case: create the isolated table and import the described derived dataset into his existing Neon, without changing tipsters or other platforms, and publish the reviewed version using existing hosting and API audience. No new paid service or plan increase is included. Visual approval alone is not permission for DB changes or release. The operator must recover Juan's actual approval and independently verify its scope before running the importer or deployment.

## Execution order after review and permission

1. Revalidate correct repository, exact reviewed commits, production DB hostname and database, table/revision state, and current limits. Check no newer work already completed the import. Keep all secret values out of logs and artifacts.
2. Produce the reviewed product from the retained validated input using prepareProductSnapshot, or use the exact reviewed payload supplied privately. SHA/count validation must match the Git manifest. No raw upload to GitHub.
3. Offline dry-run: `npx tsx scripts/import-olbg-product-snapshot.ts PRODUCT_FILE config/olbg-product-manifest.json`. This performs no DB connection or write.
4. After the explicit DB approval, run the same script with `--apply-approved --approved-revision REVISION --expected-host VERIFIED_HOST --credential-file PRIVATE_CREDENTIAL_FILE`. The flag is a mechanical guard, not authorization. Uses a direct pg client, parameterized SQL, one transaction and a5s lock timeout/30s statement timeout. All validation precedes DDL. CREATE TABLE IF NOT EXISTS plus INSERT ON CONFLICT DO NOTHING followed by byte/hash/count comparison. Any precommit failure rolls back. Successful commit is followed by another read/hash check. Existing revision is never overwritten. A failed postcommit check is not proof the insert was rolled back; reconcile the row before retrying. Delete temporary credential material afterward.
5. Keep feature OFF until import verification and normal deployment pass. No destructive schema migration required. Use the reviewed normal Git release flow and explicitly authorized flag activation. The deployment still needs independent permission; none was executed here.
6. Smoke existing home/API paths, normal filters/sorting/cursors and Niffler estimate; raw/labs404 and existing audience must match the reviewed contract. Do not rerun the accepted visual design audit unless something visibly changed.

## Rollback

Import failure before COMMIT rolls back the isolated table creation/row. If code release or activation fails, turn the release gate OFF through the existing authorized rollback flow, or restore the previously deployed code, leaving the unused table/row alone. No DROP/DELETE needed. For a later product revision, restore the prior small Git manifest and deploy normally; earlier snapshot rows remain available. A changed product revision rejects older cursors, so the client restarts rather than appending mixed pages. Do not roll back the whole database or touch crawlers/other data for an isolated OLBG read-path issue.

## Validation completed locally

- PGlite real schema, first and repeated imports, byte/hash/count validation, absent/corrupt rows, transaction rollback and retained prior revision.
- Exact product equivalence for all561profiles/6020months against the original file, five common sort results, and source-estimator output unchanged. Product projection deliberately normalizes only absent avatar to null.
- Four new tests, total548passed/13skip; tsc clean. Production build and real Next runtime use the DB provider in a disposable local DB. Same Niffler estimated yield and Historial; raw/labs404; home unauth307/API unauth200.
- No private snapshot present in any production Next trace after removal of explicit trace inputs. No UI/layout/style change.

## Live read-only capacity check, 2026-11-18

Existing Neon API key worked. Listed project blogabet-clone-filter, one ready production branch. Credential host was cross-checked against that project's endpoint with only a BEGIN READ ONLY metadata query. Current table does not exist. No branch or service was created.

- API org plan free; project subscription free_v3.
- Branch logical_size47800320bytes. Project branch size limit1073741824bytes.
- neondb pg_database_size24363008bytes. The branch and DB figures measure different scopes and are not contradictions.
- Project reports6h restore retention. This workflow does not depend on whole-DB restore.
- Product993468bytes plus storage overhead fits well below observed size limit. This is not a promise of zero incremental cost or available compute quota forever. API usage estimates are not billing. Stop if an upgrade, additional payment or unexpected capacity change would be required.

Read sources: GET https://console.neon.tech/api/v2/users/me/organizations ; GET https://console.neon.tech/api/v2/projects?org_id=org-muddy-lake-06616553 ; GET https://console.neon.tech/api/v2/projects/rough-sunset-10222856 ; GET https://console.neon.tech/api/v2/projects/rough-sunset-10222856/branches ; GET https://console.neon.tech/api/v2/projects/rough-sunset-10222856/endpoints . No API secrets in this note.

Documentation used to interpret results:
https://neon.com/docs/manage/orgs-api
https://neon.com/docs/reference/api/projects/list-projects
https://neon.com/docs/introduction/usage-calculations
https://neon.com/docs/guides/consumption-limits
