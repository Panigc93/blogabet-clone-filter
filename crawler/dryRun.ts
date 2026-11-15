// DRY_RUN of the catalog listing: bounded read-only probe of the real crawler client.
// No database, no writes, no retries. Stops at the first error or challenge.
import { parseBlocks, blogabetUrl, COMMON_HEADERS } from './listing'
import type { ListingOrder } from './listing'

export const DRY_RUN_HARD_MAX_PAGES = 3
export const DRY_RUN_MIN_DELAY_MS = 1000

export interface PageResponse { status: number; html: string }
export type PageFetcher = (url: string) => Promise<PageResponse>

export interface DryRunReport {
  pagesRequested: number
  pagesOk: number
  parsed: number
  uniqueIds: number
  duplicateIds: number
  followersNonIncreasing: boolean
  stopReason: 'completed' | 'http_error' | 'network_error' | 'challenge_or_empty' | 'invalid_config'
  detail?: string
  statuses: number[]
  firstFollowers?: number
  lastFollowers?: number
  ids?: number[]
  order?: string
  url0?: string
}

export async function runListingDryRun(opts: {
  lastActive: number
  fetchPage: PageFetcher
  sleep: (ms: number) => Promise<void>
  maxPages: number
  delayMs: number
  startOffset?: number
  order?: ListingOrder
}): Promise<DryRunReport> {
  const report: DryRunReport = {
    pagesRequested: 0, pagesOk: 0, parsed: 0, uniqueIds: 0, duplicateIds: 0,
    followersNonIncreasing: false, stopReason: 'completed', statuses: [],
    order: opts.order ?? 'default', url0: blogabetUrl(opts.lastActive, Math.max(0, Math.floor(opts.startOffset ?? 0)), opts.order),
  }
  if (!Number.isFinite(opts.delayMs) || opts.delayMs < DRY_RUN_MIN_DELAY_MS) {
    return { ...report, stopReason: 'invalid_config', detail: `delay must be >= ${DRY_RUN_MIN_DELAY_MS} ms` }
  }
  const pages = Math.min(Math.max(0, Math.floor(opts.maxPages)), DRY_RUN_HARD_MAX_PAGES)
  const ids = new Set<number>()
  let prevFollowers: number | null = null
  let start = Math.max(0, Math.floor(opts.startOffset ?? 0))
  const idList: number[] = []
  let first: number | undefined

  for (let i = 0; i < pages; i++) {
    if (i > 0) await opts.sleep(opts.delayMs)
    report.pagesRequested++
    let res: PageResponse
    try {
      res = await opts.fetchPage(blogabetUrl(opts.lastActive, start, opts.order))
    } catch (err) {
      return { ...report, stopReason: 'network_error', detail: (err as Error).message }
    }
    report.statuses.push(res.status)
    if (res.status < 200 || res.status >= 300) {
      return { ...report, stopReason: 'http_error', detail: `HTTP ${res.status}` }
    }
    const records = parseBlocks(res.html, opts.lastActive)
    if (records.length === 0) {
      return { ...report, stopReason: 'challenge_or_empty', detail: `page start=${start} had no tipsters` }
    }
    report.pagesOk++
    for (const r of records) {
      report.parsed++
      if (ids.has(r.id!)) report.duplicateIds++
      ids.add(r.id!)
      idList.push(r.id!)
      if (first === undefined) first = r.followers ?? 0
      if (prevFollowers !== null && (r.followers ?? 0) > prevFollowers) report.followersNonIncreasing = true
      prevFollowers = r.followers ?? 0
    }
    report.uniqueIds = ids.size
    start += records.length
  }
  return { ...report, ids: idList, firstFollowers: first, lastFollowers: prevFollowers ?? undefined }
}

export function nodeFetchPage(cookie: string): PageFetcher {
  return async (url: string) => {
    const res = await fetch(url, { headers: { ...COMMON_HEADERS, Cookie: cookie } })
    return { status: res.status, html: await res.text() }
  }
}
