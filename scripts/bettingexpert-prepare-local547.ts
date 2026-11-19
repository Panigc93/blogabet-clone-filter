// Fixed local preparation input, derived from the two previously reviewed
// retained Global files. No HTTP or remote database connection.
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex')
const [original,extra,evidence,out]=process.argv.slice(2)
if(!out)throw Error('usage: original13517 additionalFive evidence547 output')
const a=readFileSync(original),b=readFileSync(extra)
if(sha(a)!=='07e040a4dd4054fbdc26aaccae14a3020ec8941a53c19f21b20671bb9dd2d2b1'||sha(b)!=='868a1ddca2307381945a6322396d97dc6b6f023a14887e0e2c999a7f23cdf322')throw Error('Global source bytes changed')
const data=readFileSync(evidence)
if(sha(data)!=='910b1c807b073e4990ab303048e5eb4895a3d8b3ba7bca3a535c9d2d3a2a4106')throw Error('Window bytes changed')
const map=new Map([...JSON.parse(a.toString()),...JSON.parse(b.toString())].map(r=>[r.guid,r]))
const rows=JSON.parse(data.toString()).profiles.map((p:{sourceGuid:string;username:string})=>{
 const r=map.get(p.sourceGuid);if(!r||r.username!==p.username)throw Error('Global identity mismatch');return r
})
writeFileSync(out,JSON.stringify(rows,null,2)+'\n')
console.log(JSON.stringify({profiles:rows.length,originalGlobalSourcesSha256:[sha(a),sha(b)],windowSourceSha256:sha(data),subsetSha256:sha(readFileSync(out)),noNetwork:true}))
