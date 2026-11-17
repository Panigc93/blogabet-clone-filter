// Select only manifests that still justify at least one currently stored
// profile capture. Historical and empty replay manifests remain retained.
import { sql } from 'drizzle-orm'
export function activeManifestPredicate() {
  return sql`EXISTS (
    SELECT 1 FROM jsonb_array_elements(import_validation_log.reason::jsonb->'manifest'->'rows') AS audit_row
    JOIN tipsters AS current_tipster ON current_tipster.platform = 'bet2invest'
      AND current_tipster.slug = audit_row->>'slug'
      AND current_tipster.captured_at = (audit_row->>'capturedAt')::timestamptz
  )`
}
