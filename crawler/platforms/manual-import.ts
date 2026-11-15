// Manual/authorized import path: normalizes tipster records that the owner
// LAWFULLY holds (e.g. exported or sent by the tipster themselves, or
// provided by a platform under written permission) into the shared shape.
//
// This module never fetches anything. It exists so that "reformat what they
// already have" is possible for data with a legitimate source, with full
// provenance, without implying any platform is connected or monitored.

import type { PlatformId, StatSample, NormalizedTipster, StakeBasis } from './types'

export interface ExternalTipsterRecord {
  platform: PlatformId
  username: string
  profileUrl?: string
  accountType?: 'free' | 'premium'
  sportName?: string
  followers?: number
  stats: {
    picks?: number
    profitUnits?: number
    yieldPct?: number // the source's own figure (yield, ROI, ...), not translated
    yieldBasis?: StakeBasis
    winRatePct?: number
    avgOdds?: number
    periodLabel?: string
    scope?: string
    scopeKey?: string
  }
}

export interface ImportInput {
  // Where this dataset came from and why we may hold it. Free text, stored
  // with every record: 'provided by tipster X on 2026-11-15', ...
  sourceNote: string
  records: ExternalTipsterRecord[]
}

export class ManualImportError extends Error {}

function normalizeSample(stats: ExternalTipsterRecord['stats']): StatSample {
  return {
    picks: stats.picks ?? null,
    profitUnits: stats.profitUnits ?? null,
    yieldPct: stats.yieldPct ?? null,
    yieldBasis: stats.yieldBasis ?? 'unknown',
    winRatePct: stats.winRatePct ?? null,
    avgOdds: stats.avgOdds ?? null,
    periodLabel: stats.periodLabel ?? null,
    scope: stats.scope ?? 'all_time',
    scopeKey: stats.scopeKey ?? null,
  }
}

export function normalizeImport(input: ImportInput): NormalizedTipster[] {
  if (!input.sourceNote || input.sourceNote.trim().length < 10) {
    throw new ManualImportError('sourceNote must say where the data came from and why we may hold it')
  }
  if (!Array.isArray(input.records)) {
    throw new ManualImportError('records must be an array')
  }
  const out: NormalizedTipster[] = []
  for (let i = 0; i < input.records.length; i++) {
    const r = input.records[i]
    if (!r || typeof r.username !== 'string' || r.username.trim() === '') {
      throw new ManualImportError(`record ${i}: username is required`)
    }
    if (!r.platform) {
      throw new ManualImportError(`record ${i}: platform is required`)
    }
    out.push({
      platform: r.platform,
      platformId: `import:${r.platform}:${r.username.trim().toLowerCase()}`,
      username: r.username.trim(),
      profileUrl: r.profileUrl ?? '',
      accountType: r.accountType ?? 'unknown',
      sportName: r.sportName ?? null,
      followers: r.followers ?? null,
      samples: r.stats ? [normalizeSample(r.stats)] : [],
    })
  }
  return out
}
