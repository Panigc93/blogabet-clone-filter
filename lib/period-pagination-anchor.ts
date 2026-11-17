// A paginated list keeps its original read instant. Crossing the UTC month
// invalidates continuation instead of silently changing period sort semantics.
export function continuationAnchor(raw: string | null, now: Date): Date | null {
  if (!raw) return now
  const at = new Date(raw)
  return Number.isFinite(at.getTime()) && at <= now && at.toISOString().slice(0, 7) === now.toISOString().slice(0, 7) ? at : null
}
