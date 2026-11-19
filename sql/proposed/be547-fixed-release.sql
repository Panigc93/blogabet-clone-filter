-- Proposed only. Execute within the approved install transaction.
CREATE TABLE IF NOT EXISTS be_fixed_release (
 release_id text PRIMARY KEY, evidence_revision text NOT NULL, policy text NOT NULL,
 profiles_sha256 text NOT NULL, profiles jsonb NOT NULL, inserted_rows jsonb NOT NULL,
 run_ids jsonb NOT NULL, inserted_logs jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
