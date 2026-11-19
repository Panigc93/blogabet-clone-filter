import {assertReleaseProfiles,type BEReleaseProfile} from './bettingexpert-release-artifact'
import { sql, and, eq, gte, inArray, type SQL } from 'drizzle-orm'
import { tipsters, importValidationLog } from '@/db/schema'
import { loadResearchEvidence, EVIDENCE_REVISION } from './bettingexpert-research/evidence'
import type { BEVisiblePeriods, BEVisibleQuality } from './bettingexpert-visible-periods'
import type { olbgReadContext } from './olbg-read-context'
import type { TipsterFilters, SortField } from './query'

// Product choice: maximum fixed supported coverage, without changing classes.
// No production activation: local PGlite rehearsal through existing routes only.
export const BE_HISTORY_POLICY = 'max-supported-labeled-v1'
export function beExistingLocalEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'development' && env.USE_PGLITE === '1' && env.BE_EXISTING_LOCAL === '1'
}
export function beExistingReadContext(previous: ReturnType<typeof olbgReadContext>, now: Date, env: NodeJS.ProcessEnv = process.env, release?:BEReleaseProfile[], unavailable=false) {
  if(release)assertReleaseProfiles(release)
  const enabled=beExistingLocalEnabled(env)||!!release||unavailable
  const data=enabled&&!release&&!unavailable ? loadResearchEvidence(env.BE_PRIVATE_RESEARCH_DIR ?? '') : null
  const revision=unavailable?'be-release-unavailable':data||release ? EVIDENCE_REVISION+':'+BE_HISTORY_POLICY : null
  const rows: {guid:string;slug:string;public:BEVisiblePeriods}[]=[]
  const quality:Record<string,BEVisibleQuality>={source_boundary_gate:'contrasted',source_boundary_experimental:'experimental',terminal_global_consistent:'global-consistent',cutoff_reconstruction:'reconstructed',held:'reconstructed'}
  for (const p of data?.profiles ?? []) {
    // Fixed closed calendar windows, not rolling or silently current next month.
    if (p.windows['12m'].endExclusiveUtc.slice(0,7)!==now.toISOString().slice(0,7)) continue
    const windows={} as BEVisiblePeriods['windows']
    for (const n of ['3m','6m','12m'] as const) {
      const w=p.windows[n], numeric=w.state==='number'
      windows[n]={value:numeric?w.yieldPct:null,picks:numeric?w.picks:null,profit:numeric?w.profit:null,stake:numeric?w.stake:null,
        quality:quality[w.evidenceClass],state:w.state,reason:numeric?null:w.state==='held'?'source_validation_pending':'no_eligible_sample',
        from:w.startUtc.slice(0,7),to:new Date(Date.parse(w.endExclusiveUtc)-1).toISOString().slice(0,7)}
    }
    rows.push({guid:p.sourceGuid,slug:p.username,public:{version:1,slug:p.username,windows}})
  }
  const effectiveRows=release?release.filter(()=>now.toISOString().slice(0,7)==='2026-11'):rows
  const source=sql`jsonb_to_recordset(${JSON.stringify(effectiveRows)}::jsonb) AS be_research(guid text,slug text,public jsonb)`
  // Existing accepted profile-overall import establishes GUID and capture. No
  // username-only merge, no inferred IDs and no use of raw DB period columns.
  const joinOn=and(eq(tipsters.platform,'bettingexpert'),sql`be_research.slug=${tipsters.slug}`,
    sql`(SELECT count(*) FROM ${importValidationLog} be_proof WHERE be_proof.platform='bettingexpert'
      AND be_proof.slug=${tipsters.slug} AND be_proof.captured_at=${tipsters.capturedAt}
      AND be_proof.class='accepted[profile-overall]')=1
      AND EXISTS(SELECT 1 FROM ${importValidationLog} be_identity WHERE be_identity.platform='bettingexpert' AND be_identity.slug=${tipsters.slug} AND be_identity.captured_at=${tipsters.capturedAt} AND be_identity.class='accepted[profile-overall]' AND be_identity.reason::jsonb->>'sourceGuid'=be_research.guid)`)!
  const selectedNames=release?.map(p=>p.slug)??data?.profiles.map(p=>p.username)??[]
  const inScope=unavailable?eq(tipsters.platform,'bettingexpert'):and(eq(tipsters.platform,'bettingexpert'),inArray(tipsters.slug,selectedNames))!
  const period=(n:string,col:object)=>sql<string|null>`CASE WHEN ${inScope} THEN (be_research.public->'windows'->${n}->>'value')::numeric ELSE ${col} END`
  const columns={yield3m:period('3m',previous.projection.yield3m),yield6m:period('6m',previous.projection.yield6m),yield12m:period('12m',previous.projection.yield12m)}
  const projection={...previous.projection,...columns,
    beAudit:sql<unknown>`CASE WHEN ${inScope} THEN NULL ELSE ${(previous.projection as typeof previous.projection & {beAudit?:SQL}).beAudit??sql`NULL::jsonb`} END`,
    picks6mAvg:sql<string|null>`CASE WHEN ${inScope} THEN NULL ELSE ${previous.projection.picks6mAvg} END`,
    beResearch:sql<BEVisiblePeriods|null>`be_research.public`}
  const selected=(p:TipsterFilters)=>p.bePeriod==='3m'?columns.yield3m:p.bePeriod==='6m'?columns.yield6m:p.bePeriod==='12m'?columns.yield12m:null
  return {source,joinOn,projection,revision,enabled,
    unchanged:()=>{if(release)assertReleaseProfiles(release);else if(enabled&&!unavailable)loadResearchEvidence(env.BE_PRIVATE_RESEARCH_DIR??'');return true},
    filters:(p:TipsterFilters):SQL[]=>{
      const out=previous.filters(p),col=enabled&&p.platform==='bettingexpert'?selected(p):null
      if (col && p.beMinYield!==undefined) out.push(gte(col,String(p.beMinYield)))
      if (col && p.beMinPicks!==undefined) out.push(sql`(be_research.public->'windows'->${p.bePeriod!}->>'picks')::integer >= ${p.beMinPicks}`)
      return out
    },
    order:(sort:SortField):SQL[]=>{
      const col=sort==='yield3m'?columns.yield3m:sort==='yield6m'?columns.yield6m:sort==='yield12m'?columns.yield12m:sort==='picks6m_avg'?projection.picks6mAvg:null
      return col?[sql`${col} DESC NULLS LAST`,sql`${tipsters.id} DESC`]:previous.order(sort)
    },
  }
}
