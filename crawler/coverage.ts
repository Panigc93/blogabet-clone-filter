// Coverage accounting for a paginated catalog crawl. Pure, no I/O.
// It reports what the crawl actually saw. It does not prove the catalog is complete:
// a listing ordered by a mutable field (followers) can shift between page requests.

export type CrawlEnd = 'empty_page' | 'error'

export interface CoverageSummary {
  pages: number
  rows: number
  uniqueIds: number
  duplicateIds: number
  newIds: number | null
  orderViolations: number
  end: CrawlEnd | 'unfinished'
  complete: boolean
  note: string
}

export class CoverageTracker {
  private seen = new Set<number>()
  private pages = 0
  private rows = 0
  private dups = 0
  private violations = 0
  private newIds = 0
  private newKnown = false
  private prev: number | null = null
  private end: CrawlEnd | 'unfinished' = 'unfinished'

  addPage(records: { id: number; followers: number }[], newCount?: number) {
    this.pages += 1
    for (const r of records) {
      this.rows += 1
      if (this.seen.has(r.id)) this.dups += 1
      else this.seen.add(r.id)
      if (this.prev !== null && r.followers > this.prev) this.violations += 1
      this.prev = r.followers
    }
    if (newCount !== undefined) {
      this.newKnown = true
      this.newIds += newCount
    }
  }

  finish(end: CrawlEnd) {
    this.end = end
  }

  summary(): CoverageSummary {
    const complete = this.end === 'empty_page' && this.rows > 0
    let note: string
    if (this.end === 'error') note = 'Crawl stopped by an error: coverage is partial.'
    else if (this.end === 'unfinished') note = 'Crawl did not finish: coverage is partial.'
    else if (this.rows === 0) note = 'First page was empty: nothing was read.'
    else if (this.dups > 0 || this.violations > 0)
      note = 'Reached the end, but the listing shifted during the crawl (duplicates or order violations): some rows may have been skipped. Run a second pass to confirm.'
    else note = 'Reached the end with no duplicates or order violations. This is not proof of completeness.'
    return {
      pages: this.pages, rows: this.rows, uniqueIds: this.seen.size, duplicateIds: this.dups,
      newIds: this.newKnown ? this.newIds : null, orderViolations: this.violations,
      end: this.end, complete, note,
    }
  }
}

export function formatCoverage(s: CoverageSummary): string {
  return [
    '### Catalog crawl coverage',
    `- Pages: ${s.pages}, rows: ${s.rows}, unique ids: ${s.uniqueIds}`,
    `- Duplicates: ${s.duplicateIds}, followers order violations: ${s.orderViolations}`,
    `- New ids inserted: ${s.newIds ?? 'unknown'}`,
    `- Ended by: ${s.end}, reached end: ${s.complete ? 'yes' : 'no'}`,
    `- ${s.note}`,
  ].join('\n')
}
