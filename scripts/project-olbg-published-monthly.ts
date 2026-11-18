import {approvedOlbgAvatar} from '../lib/olbg-approved-avatar'
// Offline projection of retained accepted contracts. No network/DB imports.
// npx tsx scripts/project-olbg-published-monthly.ts CAPTURE_DIR OUTPUT_JSON
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {readOlbgNodeField} from '../crawler/platforms/olbg/reader'
import {publishedMonth,validateMonthlyProfile,type PublishedMonthlyProfile} from '../lib/olbg-published-monthly'
const [base,out]=process.argv.slice(2)
if(!base||!out)throw Error('Expected CAPTURE_DIR OUTPUT_JSON')
const accepted=JSON.parse(fs.readFileSync(path.join(base,'contract-validation.json'),'utf8')).accepted as {id:number;username:string}[]
const receipts=fs.readFileSync(path.join(base,'receipts.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s))
const hashes:Record<string,string>={}
function node(id:number,kind:string){
 const f=`raw/${id}-${kind}.json`,raw=fs.readFileSync(path.join(base,f))
 const sha=createHash('sha256').update(raw).digest('hex');hashes[f]=sha
 const receipt=[...receipts].reverse().find(r=>r.id===id&&r.kind===kind&&r.sha256===sha&&r.http===200&&!r.quarantine&&!r.stop)
 if(!receipt)throw Error(`Missing matching receipt: ${f}`)
 const n=JSON.parse(raw.toString()).nodes.at(-1)
 if(readOlbgNodeField(n,'effectiveTipsterId')!==id)throw Error('Identity mismatch')
 return {n,receipt}
}
const profiles:PublishedMonthlyProfile[]=accepted.map(p=>{
 const {n,receipt}=node(p.id,'month'),about=node(p.id,'about').n
 if(readOlbgNodeField(n,'mode')!=='month'||readOlbgNodeField(n,'monthFilterSelected')!==60)throw Error('Not global monthly')
 const opts=readOlbgNodeField(n,'monthFilterOptions') as {id:number;label:string}[]
 if(!opts.some(x=>x.id===60&&x.label==='All Tips'))throw Error('Missing scope label')
 if(readOlbgNodeField(n,'tipsterUsername')!==p.username)throw Error('Name mismatch')
 return validateMonthlyProfile({id:p.id,name:p.username,avatarUrl:approvedOlbgAvatar(about,p.id),joinedAt:readOlbgNodeField(about,'joinDate') as string,
  capturedAt:new Date(receipt.ts*1000).toISOString(),sourceUrl:`https://www.olbg.com/tipsters/about/${p.id}`,
  months:(readOlbgNodeField(n,'monthRows') as Record<string,unknown>[]).map(publishedMonth)})
})
fs.writeFileSync(out,JSON.stringify({version:1,basis:'source-published-month-global-all-tips',profiles,inputSha256:hashes},null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({profiles:profiles.length,months:profiles.reduce((s,p)=>s+p.months.length,0),sha256:createHash('sha256').update(fs.readFileSync(out)).digest('hex')}))
