// Bet2Invest catalog seed: profile slugs located in their public sitemap.
// The sitemap lists profiles the platform chose to index; it is a LOCATED
// set, not a proven total catalog (observed 2026-11-16: 300 profiles in
// the en-us sitemap). Full enumeration is an open pilot question.

export interface Bet2InvestSitemapProfile {
  slug: string
  url: string
}

export class Bet2InvestCatalogError extends Error {}

// Minimal XML entity decoding for <loc> content (&amp; last).
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function safeDecodeSlug(component: string): string {
  try {
    return decodeURIComponent(component)
  } catch {
    throw new Bet2InvestCatalogError(`malformed percent-encoding in slug: ${component.slice(0, 40)}`)
  }
}

export function parseSitemapProfiles(xml: string): Bet2InvestSitemapProfile[] {
  const profiles: Bet2InvestSitemapProfile[] = []
  const seen = new Set<string>()
  const locPattern = /<loc>\s*([^<]*\/tipsters\/performance-stats\/([^/?&<\s]+)[^<]*)\s*<\/loc>/g
  let match: RegExpExecArray | null
  while ((match = locPattern.exec(xml)) !== null) {
    const url = decodeXmlEntities(match[1].trim())
    const slug = safeDecodeSlug(decodeXmlEntities(match[2]))
    if (seen.has(slug)) continue
    seen.add(slug)
    profiles.push({ slug, url })
  }
  return profiles
}
