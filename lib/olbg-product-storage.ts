// Isolated immutable product storage. No UPDATE/DELETE, no tipsters writes.
import {decodeProductSnapshot,type ProductManifest} from './olbg-product-snapshot'
export const PRODUCT_SNAPSHOT_SCHEMA=`CREATE TABLE IF NOT EXISTS olbg_published_snapshots (
 revision text PRIMARY KEY CHECK (revision ~ '^[a-f0-9]{64}$'),
 contract_version integer NOT NULL CHECK (contract_version=1),
 profile_count integer NOT NULL CHECK (profile_count>0),
 month_count integer NOT NULL CHECK (month_count>=0),
 payload text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
)`
export interface SnapshotRow extends Record<string,unknown> {revision:string;contract_version:number;profile_count:number;month_count:number;payload:string}
export interface SnapshotSQL {query:<T extends Record<string,unknown>=Record<string,unknown>>(text:string,params?:unknown[])=>Promise<{rows:T[]}>}
export function verifyStoredSnapshot(row:SnapshotRow|undefined,manifest:ProductManifest){
 if(!row||row.revision!==manifest.revision||row.contract_version!==manifest.version||row.profile_count!==manifest.profileCount||row.month_count!==manifest.monthCount)throw Error('Missing or inconsistent pinned product snapshot')
 return decodeProductSnapshot(row.payload,manifest)
}
export async function readStoredSnapshot(sql:SnapshotSQL,manifest:ProductManifest){
 const result=await sql.query<SnapshotRow>('SELECT revision, contract_version, profile_count, month_count, payload FROM olbg_published_snapshots WHERE revision=$1',[manifest.revision])
 return verifyStoredSnapshot(result.rows[0],manifest)
}
// Caller owns transaction. Validation precedes the first mutation. An existing
// revision is verified byte-for-byte and never overwritten, including on races.
export async function importProductSnapshot(tx:SnapshotSQL,payload:string,manifest:ProductManifest){
 decodeProductSnapshot(payload,manifest)
 await tx.query(PRODUCT_SNAPSHOT_SCHEMA)
 const inserted=await tx.query('INSERT INTO olbg_published_snapshots (revision,contract_version,profile_count,month_count,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (revision) DO NOTHING RETURNING revision',[manifest.revision,manifest.version,manifest.profileCount,manifest.monthCount,payload])
 const stored=await tx.query<SnapshotRow>('SELECT revision, contract_version, profile_count, month_count, payload FROM olbg_published_snapshots WHERE revision=$1',[manifest.revision])
 verifyStoredSnapshot(stored.rows[0],manifest)
 if(stored.rows[0].payload!==payload)throw Error('Immutable revision conflict')
 return {inserted:inserted.rows.length===1,revision:manifest.revision,profileCount:manifest.profileCount,monthCount:manifest.monthCount}
}
