// Read-only capture parsing checkpoint. Local only, no network or database.
import {readdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {buildOfflineRow} from '../crawler/platforms/bet2invest/offline-import'
const [dir,at,out,from,to]=process.argv.slice(2)
const all=readdirSync(join(dir,'ssr')).filter(f=>f.endsWith('.html')).sort()
const rows=all.slice(Number(from),Number(to)).map((f,i)=>{
 const slug=f.slice(0,-5),api=join(dir,'api',`${slug}.json`)
 return buildOfflineRow({slug,html:readFileSync(join(dir,'ssr',f),'utf8'),monthsJson:existsSync(api)?JSON.parse(readFileSync(api,'utf8')):null,capturedAt:new Date(at),surrogateId:-(Number(from)+i+1)})
})
writeFileSync(out,JSON.stringify(rows));console.log(JSON.stringify({from,to,rows:rows.length,out}))
