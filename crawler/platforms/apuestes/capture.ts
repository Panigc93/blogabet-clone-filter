/** Apuestes profile capture. Reuses the durable 11 s lane pacing from the
 * Bettingexpert integration; one lane only. Any non-200 or parse failure is a
 * STOP: the profile is skipped and recorded, never retried in a loop. No DB
 * writes: output is JSONL under data/apuestes/ for later reviewed import. */
import { writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { durableLane } from '../bettingexpert/request-pacing'
import { parseApuestesProfile } from './parse'
import { isPaidProfile, ApuestesListRow } from './types'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const BASE = 'https://apuestes.com'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pacedGet(lane: ReturnType<typeof durableLane>, url: string): Promise<string | null> {
  await sleep(lane.wait())
  lane.started()
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    lane.completed()
    if (!res.ok) return null // STOP condition: caller records and skips
    return await res.text()
  } catch {
    lane.completed()
    return null
  }
}

export interface CaptureOutcome {
  username: string
  ok: boolean
  reason?: string
}

export async function captureProfiles(listing: ApuestesListRow[], outJsonl: string, lanePath: string): Promise<CaptureOutcome[]> {
  const lane = durableLane(lanePath)
  const outcomes: CaptureOutcome[] = []
  for (const row of listing) {
    const html = await pacedGet(lane, `${BASE}/tipster/${row.username}`)
    if (html == null) {
      outcomes.push({ username: row.username, ok: false, reason: 'http-failure-stop' })
      continue
    }
    try {
      const profile = parseApuestesProfile(html)
      const record = {
        source: row,
        profile,
        isPaid: isPaidProfile(profile),
        capturedAt: new Date().toISOString(),
      }
      appendFileSync(outJsonl, JSON.stringify(record) + '\n', { mode: 0o600 })
      outcomes.push({ username: row.username, ok: true })
    } catch (e) {
      outcomes.push({ username: row.username, ok: false, reason: `parse-stop:${(e as Error).message}` })
    }
  }
  return outcomes
}
