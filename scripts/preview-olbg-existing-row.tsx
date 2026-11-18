import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { TipsterRow } from '../components/TipsterRow'
import { fromOlbgPrepared } from '../components/olbg-card-model'
import { parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'
const cards = [565069, 342919, 535122].map(id => {
  const load = (mode: string) => {
    const f = JSON.parse(readFileSync(`tests/fixtures/olbg/profile-${id}-${mode}.json`, 'utf8'))
    return parseOlbgPerformance(f.node, f.originalReceipt, id, '2026-11')
  }
  return fromOlbgPrepared(prepareOlbgProfile(load('month'), load('table-1'), load('table-2')))
})
const css = readFileSync('app/globals.css', 'utf8')
const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisión local OLBG</title><style>' + css + '.text-success{color:#218838!important}.text-danger{color:#c82333!important}</style><body style="background:#f1f3f6;padding:10px"><main style="max-width:1400px;margin:auto">' + renderToStaticMarkup(<>{cards.map(t => <TipsterRow key={t.sourceUrl} tipster={t} />)}</>) + '</main></body></html>'
writeFileSync('/tmp/olbg/existing-row-preview.html', html)
