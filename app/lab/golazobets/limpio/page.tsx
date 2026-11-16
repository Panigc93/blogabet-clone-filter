import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster } from '@/components/tipster-card-model'
import { profitSortWarning } from '@/lib/query'
import { golazobetsCaptureToInsert, type GzbProfileCapture } from '@/crawler/platforms/golazobets/to-db'
import type { Tipster } from '@/db/schema'

// Lab · vista LIMPIA de cards Golazobets: el mismo componente y aviso que la
// interfaz real, SIN las notas de validacion del lab. Datos: capturas reales
// 2026-11-15 (+ avatar 2026-11-16 cuando ya se ha recogido; si no, iniciales,
// el mismo fallback de produccion). Sin base de datos.

const CAP_DIR = join(process.cwd(), 'crawler/platforms/golazobets/captures/2026-11-15-profiles')
const CAPTURED_AT = '2026-11-15T00:00:00.000Z'

const SAMPLE = ['12pedro04', 'Apuestas Tx', 'Abreu13 (CamiPicks)', 'KROM90']

export default function LabGolazobetsLimpioPage() {
  const rows = SAMPLE.map((slug, i) => {
    const cap = JSON.parse(readFileSync(join(CAP_DIR, `${slug}.json`), 'utf8')) as GzbProfileCapture
    const mapping = golazobetsCaptureToInsert(slug, cap, { capturedAt: CAPTURED_AT })
    if (!mapping.ok) throw new Error(mapping.reason)
    return { ...mapping.insert, id: 9100 + i, updatedAt: new Date(CAPTURED_AT) } as Tipster
  })
  const aviso = profitSortWarning('profit', undefined)

  return (
    <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px' }}>
      {aviso && (
        <div style={{ margin: '8px 0 12px', padding: '8px 12px', background: '#fcf8e3', border: '1px solid #faebcc', borderRadius: 4, fontSize: 13, color: '#8a6d3b' }}>
          {aviso}
        </div>
      )}
      {rows.map((t) => (
        <TipsterRow key={t.id} tipster={fromDbTipster(t)} />
      ))}
    </div>
  )
}
