import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { OlbgStats } from '../components/olbg/OlbgStats'
import { parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'

const profiles = [565069, 342919, 535122].map(id => {
  const load = (mode: string) => {
    const f = JSON.parse(readFileSync(`tests/fixtures/olbg/profile-${id}-${mode}.json`, 'utf8'))
    return parseOlbgPerformance(f.node, f.originalReceipt, id, '2026-11')
  }
  return prepareOlbgProfile(load('month'), load('table-1'), load('table-2'))
})
const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OLBG · Estadísticas por ámbito</title><body style="background:#f1f3f6;margin:0;padding:20px 10px"><main style="max-width:1160px;margin:auto">' + renderToStaticMarkup(<>{profiles.map(p => <OlbgStats key={p.profileId} profile={p} />)}</>) + '</main></body></html>'
writeFileSync('/tmp/olbg/preview.html', html)
writeFileSync('/tmp/olbg/prepared-profiles.json', JSON.stringify(profiles, null, 2))
