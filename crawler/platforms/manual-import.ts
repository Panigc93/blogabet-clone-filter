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
  stats?: {
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

function normalizeSample(stats: NonNullable<ExternalTipsterRecord['stats']>): StatSample {
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

const PLATFORMS: PlatformId[] = ['blogabet', 'golazobets', 'tipstrr']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function optNumber(v: unknown, path: string): number | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ManualImportError(`${path} must be a finite number, got ${JSON.stringify(v)}`)
  }
  return v
}

function optString(v: unknown, path: string): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') {
    throw new ManualImportError(`${path} must be a string, got ${JSON.stringify(v)}`)
  }
  return v
}

// Validates an untrusted parsed-JSON file into ImportInput. Strict on
// numeric fields: a string like "12.5" is rejected, never coerced, so a
// hand-made file fails loudly instead of silently corrupting stats.
export function parseImportFile(raw: unknown): ImportInput {
  if (!isPlainObject(raw)) {
    throw new ManualImportError('import file must be a JSON object with sourceNote and records')
  }
  const sourceNote = optString(raw.sourceNote, 'sourceNote')
  if (!sourceNote || sourceNote.trim().length < 10) {
    throw new ManualImportError('sourceNote must say where the data came from and why we may hold it')
  }
  if (!Array.isArray(raw.records)) {
    throw new ManualImportError('records must be an array')
  }
  const records: ExternalTipsterRecord[] = []
  for (let i = 0; i < raw.records.length; i++) {
    const path = `record ${i}`
    const r = raw.records[i]
    if (!isPlainObject(r)) throw new ManualImportError(`${path} must be an object`)
    const platform = optString(r.platform, `${path}.platform`) as PlatformId | undefined
    if (!platform || !PLATFORMS.includes(platform)) {
      throw new ManualImportError(`${path}.platform must be one of ${PLATFORMS.join(', ')}`)
    }
    const username = optString(r.username, `${path}.username`)
    if (!username || username.trim() === '') {
      throw new ManualImportError(`${path}.username is required`)
    }
    const accountType = optString(r.accountType, `${path}.accountType`)
    if (accountType !== undefined && accountType !== 'free' && accountType !== 'premium') {
      throw new ManualImportError(`${path}.accountType must be 'free' or 'premium'`)
    }
    let stats: ExternalTipsterRecord['stats'] | undefined
    if (r.stats !== undefined && r.stats !== null) {
      if (!isPlainObject(r.stats)) throw new ManualImportError(`${path}.stats must be an object`)
      const s = r.stats
      const sp = `${path}.stats`
      const yieldBasis = optString(s.yieldBasis, `${sp}.yieldBasis`) as StakeBasis | undefined
      stats = {
        picks: optNumber(s.picks, `${sp}.picks`),
        profitUnits: optNumber(s.profitUnits, `${sp}.profitUnits`),
        yieldPct: optNumber(s.yieldPct, `${sp}.yieldPct`),
        yieldBasis,
        winRatePct: optNumber(s.winRatePct, `${sp}.winRatePct`),
        avgOdds: optNumber(s.avgOdds, `${sp}.avgOdds`),
        periodLabel: optString(s.periodLabel, `${sp}.periodLabel`),
        scope: optString(s.scope, `${sp}.scope`),
        scopeKey: optString(s.scopeKey, `${sp}.scopeKey`),
      }
    }
    records.push({
      platform,
      username,
      profileUrl: optString(r.profileUrl, `${path}.profileUrl`),
      accountType,
      sportName: optString(r.sportName, `${path}.sportName`),
      followers: optNumber(r.followers, `${path}.followers`),
      stats,
    })
  }
  return { sourceNote, records }
}
