// Validation of the /comparar?slugs=a,b,c param. Blogabet slugs are lowercase
// subdomain labels; anything else is dropped before reaching SQL.

export const COMPARE_MAX = 4

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

export interface ParsedCompare {
  slugs: string[]
  rejected: string[]
}

export function parseCompareSlugs(raw: string | undefined): ParsedCompare {
  const slugs: string[] = []
  const rejected: string[] = []
  if (!raw) return { slugs, rejected }

  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase()
    if (!slug) continue
    if (!SLUG_RE.test(slug) || slugs.includes(slug)) {
      rejected.push(slug)
      continue
    }
    if (slugs.length >= COMPARE_MAX) {
      rejected.push(slug)
      continue
    }
    slugs.push(slug)
  }
  return { slugs, rejected }
}
