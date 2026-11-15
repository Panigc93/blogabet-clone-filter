// Lab snapshots LOADED from the real dated captures via the offline
// ingestion path (crawler/platforms/tipstrr/load-capture.ts). This replaces
// hand transcription for every derivable figure; the reviewed fixtures
// (ficha/fixtures.ts) remain as the editorial record (page-verbatim labels,
// notes, notAvailable) and as the regression reference in
// tests/crawler/tipstrr-load-capture.test.ts.

import { loadTipstrrCapture, formatEsEur, type TipstrrStatsCapture } from '@/crawler/platforms/tipstrr/load-capture'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT, type FichaSnapshot } from './ficha/fixtures'
import tleCaptureJson from '@/crawler/platforms/tipstrr/captures/2026-11-15-tle-stats-state.json'
import statmindCaptureJson from '@/crawler/platforms/tipstrr/captures/2026-11-15-statmind-stats-state.json'

// Verified account display: units x 10 EUR (unit normalization, not FX).
const eur10 = (u: number) => formatEsEur(u * 10)

export const TLE_LOADED: FichaSnapshot = loadTipstrrCapture(tleCaptureJson as TipstrrStatsCapture, {
  sourceUrl: TLE_SNAPSHOT.sourceUrl,
  capturedAt: TLE_SNAPSHOT.capturedAt,
  capturedAtDate: TLE_SNAPSHOT.capturedAtDate,
  formatMoney: eur10,
  editorial: {
    platformLabel: TLE_SNAPSHOT.platformLabel,
    stakeLabel: TLE_SNAPSHOT.overview.stakeLabel,
    roiPeriodLabel: TLE_SNAPSHOT.overview.roiPeriodLabel,
    activeTipsNow: TLE_SNAPSHOT.activeTipsNow, // observed on page; state said 0
    lastResultVisibleLabel: TLE_SNAPSHOT.lastResultVisibleLabel,
    yieldEquivalenceNote: TLE_SNAPSHOT.yieldEquivalenceNote,
    notAvailable: TLE_SNAPSHOT.notAvailable,
  },
})

export const STATMIND_LOADED: FichaSnapshot = loadTipstrrCapture(statmindCaptureJson as TipstrrStatsCapture, {
  sourceUrl: STATMIND_SNAPSHOT.sourceUrl,
  capturedAt: STATMIND_SNAPSHOT.capturedAt,
  capturedAtDate: STATMIND_SNAPSHOT.capturedAtDate,
  formatMoney: eur10,
  editorial: {
    platformLabel: STATMIND_SNAPSHOT.platformLabel,
    stakeLabel: STATMIND_SNAPSHOT.overview.stakeLabel,
    roiPeriodLabel: STATMIND_SNAPSHOT.overview.roiPeriodLabel,
    lastResultVisibleLabel: STATMIND_SNAPSHOT.lastResultVisibleLabel,
    yieldEquivalenceNote: STATMIND_SNAPSHOT.yieldEquivalenceNote,
    notAvailable: STATMIND_SNAPSHOT.notAvailable,
  },
})
