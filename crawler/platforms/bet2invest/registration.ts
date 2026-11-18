import * as cheerio from 'cheerio'

/** Source: public listing renderer kOJ-ONWY.js, verified 2026-11-18.
 * Since is year(tipster.createdAt), not first bet, bankroll creation or reset.
 * Read only the unique account object, bound to the profile's exact username.
 */
export function registrationCreatedAt(html: string, expectedUsername: string): string | null {
  const scripts = cheerio.load(html)('script#__NUXT_DATA__')
  if (scripts.length !== 1) return null
  let d: unknown[]
  try {
    const value: unknown = JSON.parse(scripts.text())
    if (!Array.isArray(value)) return null
    d = value
  } catch { return null }
  const users = d.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && 'username' in v && 'lastBetAt' in v)
  if (users.length !== 1) return null
  const deref = (v: unknown): unknown => Number.isInteger(v) && (v as number) >= 0 && (v as number) < d.length ? d[v as number] : undefined
  const user = users[0]
  if (deref(user.username) !== expectedUsername) return null
  return validRegistrationDate(deref(user.createdAt))
}

export function validRegistrationDate(value: unknown, capturedAt?: Date): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value || date.getUTCFullYear() < 1970) return null
  if (capturedAt && (!Number.isFinite(capturedAt.getTime()) || date > capturedAt)) return null
  return value
}
