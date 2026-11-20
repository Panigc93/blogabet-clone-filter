import { ApuestesProfile, ApuestesPeriodStats } from './types'

// Extracts the JSON.parse('<js-escaped>') blocks the Apuestes profile page
// embeds in its Vue bootstrap. One GET per profile carries identity, all
// period stats, price plans and monthly history; no extra API calls needed.

const BLOCK = /(\w+):\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/g

// Single-pass unescape, left-to-right like Python's unicode_escape: every
// backslash sequence decodes to its char in one scan. That ordering matters
// for sequences like \\\\u00f3 (escaped backslash, then literal u00f3),
// which must end as the valid JSON escape \u00f3. A multi-pass replace
// decodes uXXXX first and corrupts it into an invalid \<char>.
function unescapeJs(raw: string): string {
  return raw.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g, (_m, hex: string | undefined, ch: string) => {
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    switch (ch) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      default: return ch // \\ \" \' \/ and non-JSON escapes like \ó
    }
  })
}

function blocks(html: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const m of Array.from(html.matchAll(BLOCK))) {
    try { out[m[1]] = JSON.parse(unescapeJs(m[2])) } catch { /* skip non-JSON blocks */ }
  }
  return out
}

function period(src: unknown): ApuestesPeriodStats {
  const s = (src ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
  const totalPicks = Number(s.totalPicks ?? 0)
  return {
    totalPicks,
    totalProfit: num(s.totalProfit),
    stakeAvg: num(s.stakeAvg),
    oddsAvg: num(s.oddsAvg),
    winPicks: num(s.winPicks),
    lostPicks: num(s.lostPicks),
    nullPicks: num(s.nullPicks),
    winRate: num(s.winRate),
    // 0 picks in the window means no data: yield stays null, never 0
    yield: totalPicks > 0 ? num(s.yield) : null,
  }
}

export function parseApuestesProfile(html: string): ApuestesProfile {
  const b = blocks(html)
  const t = (b.tipster ?? {}) as Record<string, unknown>
  const stats = (b.stats ?? {}) as Record<string, unknown>
  const months = Array.isArray(stats.months) ? stats.months as Array<Record<string, unknown>> : []
  const lastActivityMonth = months
    .map(m => String(m.fecha_pub2 ?? ''))
    .filter(Boolean)
    .sort()
    .pop() ?? null
  return {
    id: Number(t.id),
    username: String(t.username ?? ''),
    type: t.type == null ? null : Number(t.type),
    followers: t.followers == null ? null : Number(t.followers),
    pickPrice: t.pickPrice == null ? null : Number(t.pickPrice),
    pricePlans: (t.pricePlans ?? null) as ApuestesProfile['pricePlans'],
    historico: period(b.generalStats),
    m3: period(b.generalStatsLastTreeMonth),
    m6: period(b.generalStatsLastSixMonth),
    m12: period(b.generalStatsLastOneYear),
    lastActivityMonth,
  }
}
