// Per-pick ingestion schema for Tipstrr.
//
// Provenance (verified 2026-11-15, one-off live reads, account session):
// the /tipster/<slug>/results page embeds full per-tip objects in its own
// hydration state (PORTFOLIO_TIP_CACHED) for the visible window only
// (~4-10 most recent tips). The paginated completed-tips list the UI uses
// (/api/portfolio/<slug>/tips/completed?skip=N) returns a COMPACT shape
// (date, reference, result, free, type, portfolioReference) WITHOUT stake.
// No bounded route for full-history per-pick detail has been verified.
//
// Scale: stake/profit are Tipstrr UNITS, never money. 1 unit is what the
// site renders as "10/10" and converts to the viewing account's configured
// stake (e.g. 10 € at 10 €/unit). Store units; derive money at display.
// Do NOT infer a tip's stake from aggregate band distributions; only the
// per-tip object is evidence for that tip.
//
// Result codes verified by arithmetic on real tips: 1 = won, 3 = lost.
// Void / half-won / half-lost codes are UNVERIFIED — keep the raw code.
// The `free` flag's semantics are NOT validated (2026-11-15 control: a
// tipster labelled free shows free:false on all sampled settled tips);
// preserve it raw and never read it as "paid".

export const RESULT_CODES = { won: 1, lost: 3 } as const

export interface TipstrrPerPick {
  reference: string // dedup key, e.g. "2026-11-14-teplice-v-karvina-02ocv"
  publishedAt: string | null // dateAdded: when the tip was published
  eventDate: string | null // tipDate: when the event starts
  stakeUnits: number | null // advised stake in Tipstrr units (1 = "10/10")
  oddsAdvised: number | null // createdOdds
  oddsFinal: number | null // finalOdds
  profitUnits: number | null // settled profit in units
  resultCode: number | null // raw; 1 won / 3 lost verified, rest unverified
  result: 'won' | 'lost' | null // null when the code is not yet mapped
  eachWay: boolean | null
  market: string | null // e.g. "Both teams to score"
  selection: string | null // e.g. "No"
  line: string | null
  bookmakerId: number | null // source's internal id; name may be null
  free: boolean | null // raw flag, semantics NOT validated — never "paid"
}

// Normalizes one embedded per-tip object (PORTFOLIO_TIP_CACHED entry).
// Pure function over already-captured data; fetches nothing.
export function normalizeTipstrrTip(raw: unknown): TipstrrPerPick {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('tipstrr per-pick: expected object')
  }
  const t = raw as Record<string, unknown>
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v !== '' ? v : null
  const bool = (v: unknown): boolean | null =>
    typeof v === 'boolean' ? v : null

  const bet = Array.isArray(t.tipBet) && t.tipBet.length > 0
    ? (t.tipBet[0] as Record<string, unknown>)
    : null
  const item = Array.isArray(t.tipBetItem) && t.tipBetItem.length > 0
    ? (t.tipBetItem[0] as Record<string, unknown>)
    : null

  const resultCode = num(t.result)
  const result =
    resultCode === RESULT_CODES.won
      ? 'won'
      : resultCode === RESULT_CODES.lost
        ? 'lost'
        : null

  return {
    reference: str(t.reference) ?? '',
    publishedAt: str(t.dateAdded),
    eventDate: str(t.tipDate),
    stakeUnits: num(t.totalStake) ?? (bet ? num(bet.stake) : null),
    oddsAdvised: item ? num(item.createdOdds) : bet ? num(bet.odds) : null,
    oddsFinal: item ? num(item.finalOdds) : bet ? num(bet.finalOdds) : null,
    profitUnits: num(t.profit) ?? (bet ? num(bet.profit) : null),
    resultCode,
    result,
    eachWay: bool(t.eachWay),
    market: item ? str(item.marketText) : null,
    selection: item ? str(item.betText) : null,
    line: item ? str(item.line) : null,
    bookmakerId: num(t.bookmakerId),
    free: bool(t.free),
  }
}
