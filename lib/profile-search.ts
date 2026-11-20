// Search pasted profile links as identities, without fetching any URL.
// Unknown hosts remain ordinary search text, never a cross-platform slug.
export function profileSearch(input: string): { platform: string; slug: string } | null {
  const text = input.trim()
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`) } catch { return null }
  if (u.username || u.password || !['http:', 'https:'].includes(u.protocol)) return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/+$/, '')
  const rules: [string, string, RegExp][] = [
    ['tipstrr.com', 'tipstrr', /^\/tipster\/([^/]+)(?:\/stats|\/results)?$/],
    ['golazobets.com', 'golazobets', /^\/tipster\/([^/]+)$/],
    ['bet2invest.com', 'bet2invest', /^\/tipsters\/performance-stats\/([^/]+)$/],
    ['bettingexpert.com', 'bettingexpert', /^\/user\/profile\/([^/]+)$/],
    ['apuestes.com', 'apuestes', /^\/tipster\/([^/]+)$/],
    ['olbg.com', 'olbg', /^\/tipsters\/about\/(\d+)$/],
  ]
  if (/^[a-z0-9-]+\.blogabet\.com$/.test(host)) return { platform: 'blogabet', slug: host.slice(0, -'.blogabet.com'.length) }
  for (const [domain, platform, pattern] of rules) {
    const match = host === domain ? path.match(pattern) : null
    if (match) {
      try { return { platform, slug: decodeURIComponent(match[1]) } } catch { return null }
    }
  }
  return null
}
