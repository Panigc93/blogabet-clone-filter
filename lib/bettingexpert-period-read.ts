import {sql,and,eq} from 'drizzle-orm'
import {tipsters} from '@/db/schema'
import {validBEAudit,beClientAudit,type BEAudit,type BEClientAudit} from './bettingexpert-period-contract'
import type {periodReadContext} from './bet2invest-period-read'
export function beReadContext(previous:ReturnType<typeof periodReadContext>,audits:BEAudit[],now:Date){
 const active=audits.filter(validBEAudit).filter(a=>a.globalCapturedAt<=now.toISOString()&&a.periodCapturedAt<=now.toISOString()&&a.anchorCapturedAt<=now.toISOString()&&a.periodCapturedAt.slice(0,7)===now.toISOString().slice(0,7)&&a.anchorCapturedAt.slice(0,7)===now.toISOString().slice(0,7))
 if(new Set(active.map(x=>x.slug)).size!==active.length)throw Error('duplicate BE audit')
 const publicRows=active.map(beClientAudit)
 const source=sql`jsonb_to_recordset(${JSON.stringify(publicRows)}::jsonb) AS be_audit(slug text,"globalCapturedAt" text,"periodCapturedAt" text,"anchorCapturedAt" text,windows jsonb)`
 const joinOn=and(eq(tipsters.platform,'bettingexpert'),sql`be_audit.slug=${tipsters.slug}`,sql`be_audit."globalCapturedAt"::timestamptz=${tipsters.capturedAt}`)!
 const value=(n:number)=>sql<string|null>`(be_audit.windows->${String(n)}->>'value')::numeric`
 const wrap=(n:number,col:object)=>sql<string|null>`CASE WHEN ${tipsters.platform}='bettingexpert' THEN ${value(n)} ELSE ${col} END`
 const projection={...previous.projection,yield3m:wrap(3,previous.projection.yield3m),yield6m:wrap(6,previous.projection.yield6m),yield12m:wrap(12,previous.projection.yield12m),picks6mAvg:sql<string|null>`CASE WHEN ${tipsters.platform}='bettingexpert' THEN CASE WHEN be_audit.windows->'6'->>'value' IS NOT NULL THEN (be_audit.windows->'6'->>'picks')::numeric/6 ELSE NULL END ELSE ${previous.projection.picks6mAvg} END`,beAudit:sql<BEClientAudit|null>`CASE WHEN ${tipsters.platform}='bettingexpert' AND be_audit.slug IS NOT NULL THEN jsonb_build_object('slug',be_audit.slug,'globalCapturedAt',be_audit."globalCapturedAt",'periodCapturedAt',be_audit."periodCapturedAt",'anchorCapturedAt',be_audit."anchorCapturedAt",'windows',be_audit.windows) ELSE NULL END`}
 return{...previous,source,joinOn,projection}
}
