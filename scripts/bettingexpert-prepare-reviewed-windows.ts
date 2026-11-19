/** Private offline inputs -> reviewable index file. No DB/network activation.
 * Usage: npx tsx scripts/bettingexpert-prepare-reviewed-windows.ts MANIFEST STAGED_DIR OUTPUT
 * Manifest sources have relative file names. Keep all captures outside git.
 */
import {readFileSync,writeFileSync}from 'node:fs'
import {resolve,sep,isAbsolute}from 'node:path'
import {prepareReviewedBEWindows,type BEReviewedManifest}from '../crawler/platforms/bettingexpert/prepare-reviewed-windows'
const [manifestPath,directory,output]=process.argv.slice(2)
if(!manifestPath||!directory||!output)throw Error('expected manifest, private staged directory and NEW output path')
const m=JSON.parse(readFileSync(manifestPath,'utf8'))as Omit<BEReviewedManifest,'sources'>&{sources:({file:string}&BEReviewedManifest['sources'][number])[];preparedAt:string}
const root=resolve(directory)
const sources=m.sources.map(s=>{const p=resolve(root,s.file);if(isAbsolute(s.file)||!p.startsWith(root+sep))throw Error('staged path escapes private source directory');return readFileSync(p,'utf8')})
const pack=prepareReviewedBEWindows(m,sources,m.preparedAt)
writeFileSync(output,JSON.stringify(pack,null,2),{flag:'wx',mode:0o600})
console.log(JSON.stringify({output,revision:pack.revision,...pack.summary}))
