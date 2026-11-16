import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster } from '@/components/tipster-card-model'
import {
  golazobetsCaptureToInsert,
  golazobetsClosureGate,
  type GzbProfileCapture,
} from '@/crawler/platforms/golazobets/to-db'
import type { Tipster } from '@/db/schema'

// Vista previa VISUAL de filas Golazobets con el pipeline real de tarjeta
// (captura -> golazobetsCaptureToInsert -> fromDbTipster -> TipsterRow).
// Datos: capturas reales fechadas 2026-11-15, no una sincronizacion. Esta
// pagina no toca la base de datos; es solo previsualizacion de la UI antes
// de cualquier importacion (produccion pendiente de autorizacion).

const CAP_DIR = join(process.cwd(), 'crawler/platforms/golazobets/captures/2026-11-15-profiles')
const CAPTURED_AT = '2026-11-15T00:00:00.000Z'

// Muestra deliberada: cierre exacto, premium con slug con espacios, slug con
// parentesis, y los dos casos limite de yield (intervalo amplio, etiquetados
// como compatibles con redondeo, NO causales).
const SAMPLE: { slug: string; nota: string }[] = [
  { slug: 'KROM90', nota: 'cierre exacto (diffs ~0), gratis' },
  { slug: 'Apuestas Tx', nota: 'premium (precio no expuesto: sin etiqueta de precio), slug con espacio' },
  { slug: 'Abreu13 (CamiPicks)', nota: 'slug con parentesis: la URL de origen va codificada' },
  { slug: 'FutbolEnCasa', nota: 'CASO LIMITE: yield compatible por amplitud de intervalo, no causalidad' },
  { slug: 'GOLAZOBETS', nota: 'CASO LIMITE: yield compatible por amplitud de intervalo, no causalidad' },
]

export default function LabGolazobetsPage() {
  const rows = SAMPLE.map(({ slug, nota }, i) => {
    const cap = JSON.parse(readFileSync(join(CAP_DIR, `${slug}.json`), 'utf8')) as GzbProfileCapture
    const gate = golazobetsClosureGate(cap)
    const mapping = golazobetsCaptureToInsert(slug, cap, { capturedAt: CAPTURED_AT })
    if (!mapping.ok) return { slug, nota, error: mapping.reason, card: null, gate }
    const t = { ...mapping.insert, id: 9000 + i, updatedAt: new Date(CAPTURED_AT) } as Tipster
    return { slug, nota, error: null, card: fromDbTipster(t), gate }
  })

  return (
    <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lab · vista previa Golazobets</h1>
      <p style={{ fontSize: 13, color: '#555', maxWidth: 760 }}>
        Filas renderizadas con el pipeline real desde capturas fechadas (2026-11-15). El beneficio
        se etiqueta como <strong>u (Golazobets)</strong>: no es equivalente a los € de Blogabet ni a
        las u de Tipstrr, y la ordenacion por beneficio las agrupa por unidad, nunca las mezcla.
        Campos no expuestos por la plataforma: guion (null), nunca 0.
      </p>
      {rows.map(({ slug, nota, error, card, gate }) => (
        <div key={slug} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#8a6d3b', background: '#fcf8e3', border: '1px solid #faebcc', borderRadius: 4, padding: '4px 10px', marginBottom: 4 }}>
            {slug} — {nota}
            {gate.ok && (
              <span style={{ color: '#777' }}>
                {' '}· puerta ok (picks exactos; intervalo yield [{gate.diffs.yieldLo.toFixed(2)}, {gate.diffs.yieldHi.toFixed(2)}])
              </span>
            )}
          </div>
          {error !== null ? (
            <div style={{ fontSize: 13, color: '#a94442' }}>mapeo rechazado: {error}</div>
          ) : (
            card && <TipsterRow tipster={card} />
          )}
        </div>
      ))}
    </div>
  )
}
