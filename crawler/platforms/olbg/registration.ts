import { readOlbgNodeField, makeOlbgSource, type OlbgSource } from './reader'
export interface OlbgRegistration {
 version: 1; profileId: number; username: string; joinedAt: string; source: OlbgSource
}
export function parseOlbgRegistration(raw:string,url:string,capturedAt:string,httpDate:string|null,expectedId:number):OlbgRegistration {
 const source=makeOlbgSource(raw,url,capturedAt,httpDate),u=new URL(url)
 if(!Number.isSafeInteger(expectedId)||expectedId<=0||u.pathname!==`/tipsters/about/${expectedId}/__data.json`||u.search)throw Error('Registration URL mismatch')
 const nodes=JSON.parse(raw).nodes
 if(!Array.isArray(nodes)||nodes.length<1)throw Error('Missing registration node')
 const node=nodes.at(-1),profileId=readOlbgNodeField(node,'effectiveTipsterId'),username=readOlbgNodeField(node,'tipsterUsername'),joinedAt=readOlbgNodeField(node,'joinDate')
 if(profileId!==expectedId||typeof username!=='string'||!username.trim()||username.length>300||typeof joinedAt!=='string'||!/^\d{4}-\d\d-\d\d$/.test(joinedAt)||new Date(joinedAt+'T00:00:00Z').toISOString().slice(0,10)!==joinedAt||joinedAt>capturedAt.slice(0,10))throw Error('Invalid registration fact')
 return {version:1,profileId,username,joinedAt,source}
}
export function validOlbgRegistration(x:unknown):x is OlbgRegistration {
 try{
 const r=x as OlbgRegistration,u=new URL(r.source.url)
 return r.version===1&&Number.isSafeInteger(r.profileId)&&r.profileId>0&&typeof r.username==='string'&&r.username.length>0&&u.origin==='https://www.olbg.com'&&u.pathname===`/tipsters/about/${r.profileId}/__data.json`&&!u.search&&!u.hash&&!u.username&&!u.password&&/^\d{4}-\d\d-\d\d$/.test(r.joinedAt)&&new Date(r.joinedAt+'T00:00:00Z').toISOString().slice(0,10)===r.joinedAt&&new Date(r.source.capturedAt).toISOString()===r.source.capturedAt&&r.joinedAt<=r.source.capturedAt.slice(0,10)&&/^[a-f0-9]{64}$/.test(r.source.sha256)&&Number.isSafeInteger(r.source.bytes)&&r.source.bytes>0&&r.source.bytes<=2*1024*1024
 }catch{return false}
}
