// Local, offline preparation. Original response headers and recovered download
// completion trace are evidence, never execution instructions.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { buildOfflineRow } from '../crawler/platforms/bet2invest/offline-import'
import type { SourceCapture } from '../crawler/platforms/bet2invest/database-manifest'
const [corpus, overrides, trace, out, start, end, recovered, recoveredApi] = process.argv.slice(2)
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const table = readFileSync(join(trace, 'TRAZA-DESCARGA.md'), 'utf8')
const names = Array.from(new Set([...readdirSync(join(corpus, 'ssr')), ...readdirSync(overrides)].filter(f => f.endsWith('.html')).map(f => f.slice(0,-5)))).sort()
function source(slug: string, kind: 'ssr' | 'api'): { body: string; evidence: SourceCapture['ssr'] } | null {
  const ext = kind === 'ssr' ? 'html' : 'json'
  const fresh = join(overrides, `${slug}.${ext}`)
  const candidates = [join(corpus, kind, `${slug}.${ext}`), join(corpus, 'api-candidates', `${slug}.${ext}`), join(trace, 'original-headers', `${slug}.${ext}`)]
  const path = existsSync(fresh) ? fresh : candidates.find(existsSync)
  if (!path) return null
  const body = readFileSync(path, 'utf8')
  if (path === fresh) {
    const row = table.split('\n').find(line => line.startsWith(`| ${slug} |`))
    const cell = row?.split('|')[kind === 'ssr' ? 2 : 3]?.trim().match(/^\d{2}:\d{2}:\d{2}/)?.[0]
    if (!cell || !/^\d{2}:\d{2}:\d{2}$/.test(cell)) throw Error(`missing local completion evidence: ${slug}/${kind}`)
    return { body, evidence: { at: new Date(`2026-11-17T${cell}+01:00`).toISOString(), basis: 'local-download-completed', sha256: hash(body) } }
  }
  const headers = [path + '.hdr', join(trace, 'original-headers', `${slug}.${ext}.hdr`)].find(existsSync)
  if (!headers) {
    const recoveredPath = kind === 'ssr' ? recovered : recoveredApi
    const record = recoveredPath ? readFileSync(recoveredPath, 'utf8').split('\n').map(l=>l.split('\t')).find(r=>r[0]===slug) : null
    if (!record || Number(record[3]) !== Buffer.byteLength(body) || record[2] !== '200') throw Error(`missing original header: ${slug}/${kind}`)
    return {body,evidence:{at:new Date(record[1]).toISOString(),basis:'local-request-recorded',sha256:hash(body)}}
  }
  const date = /^date:\s*(.+)$/im.exec(readFileSync(headers, 'utf8'))?.[1]?.trim()
  if (!date || !Number.isFinite(Date.parse(date))) throw Error(`invalid original date: ${slug}/${kind}`)
  return { body, evidence: { at: new Date(date).toISOString(), basis: 'http-date', sha256: hash(body) } }
}
const held: {slug: string; reason: string}[] = []
const selectedNames = Number(start) < 0 ? names.filter(slug => !existsSync(join(corpus,'ssr',slug+'.html.hdr')) || slug==='Gerganaana') : names.slice(Number(start),Number(end))
const entries = selectedNames.flatMap((slug, i) => {
 try {
  const ssr = source(slug, 'ssr')
  if (!ssr) throw Error(`missing SSR: ${slug}`)
  const api = source(slug, 'api')
  const capturedAt = new Date(ssr.evidence.at)
  const row = buildOfflineRow({ slug, html: ssr.body, monthsJson: api ? JSON.parse(api.body) : null, capturedAt, surrogateId: -(Number(start)+i+1) })
  return [{ capturedAt: capturedAt.toISOString(), row, source: { slug, ssr: ssr.evidence, api: api?.evidence ?? null } satisfies SourceCapture }]
 } catch (error) { held.push({slug, reason: error instanceof Error ? error.message : String(error)}); return [] }
})
writeFileSync(out, JSON.stringify({ schemaVersion: 1, entries, held }))
console.log(JSON.stringify({ totalProfiles: names.length, prepared: entries.length, start, end, out }))
