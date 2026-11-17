import { notFound } from 'next/navigation'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster, type TipsterReadRow } from '@/components/tipster-card-model'

// Vista previa VISUAL aislada de filas OLBG con el pipeline real de tarjeta
// (fila de lectura -> fromDbTipster -> TipsterRow). Datos FULLY SYNTHETIC
// (identidades y cifras inventadas): no hay fetch, ni capturas reales, ni
// base de datos. Sin LAB_PREVIEW=1 responde 404, igual que el resto de /lab.
// Sirve para revisar la limpieza de etiquetas y el detalle "Historial parcial".

export const dynamic = 'force-dynamic'

const now = () => new Date()
const monthBack = (n: number) => {
  const d = now(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 7)
}

function row(): TipsterReadRow {
  const sourceMonth = monthBack(0)
  const capturedAt = new Date(now().getTime() - 3600_000).toISOString()
  const covered: string[] = []
  for (let i = 11; i >= 0; i--) if (i !== 5) covered.push(monthBack(i))
  return {
    id: -1, platform: 'olbg', slug: '999999', name: 'SINTETICO-OLBG',
    profitUnit: 'olbg-level-stakes-units', priceCurrency: null, avatarUrl: null,
    flagUrl: null, countryCode: null, isPaid: null, price: null, sinceYear: null,
    picks: null, profit: null, yield: null, verifiedPct: null, isVerified: null,
    followers: null, lastPickAt: null, signupAt: null, capturedAt: new Date(capturedAt),
    resetCount: null, lastResetAt: null, updatedAt: new Date(capturedAt),
    picks6mAvg: null, yield3m: null, yield6m: null, yield12m: null,
    picksFree3mAvg: null, yieldFree3m: null, statsUpdatedAt: null,
    sourcePortfolioId: null, b2iAudit: null,
    olbgJoinedAt: '2014-10-24',
    olbgObserved: { covered, tips: 1150, lsp: 108.78 },
    olbgEvidence: {
      version: 1, formula: 'global-fixed-unit-v1', profileId: 999999,
      profileUrl: 'https://www.olbg.com/tipsters/about/999999',
      capturedAt, sourceMonth,
      windows: [
        { n: 3, from: monthBack(3), through: monthBack(1), tips: 660, lsp: 230.92, present: 3, missing: [] },
        { n: 6, from: monthBack(6), through: monthBack(1), tips: null, lsp: null, present: 5, missing: [monthBack(5)] },
        { n: 12, from: monthBack(12), through: monthBack(1), tips: null, lsp: null, present: 7, missing: [monthBack(11), monthBack(10), monthBack(9), monthBack(8), monthBack(5)] },
      ],
    },
  } as unknown as TipsterReadRow
}

export default function LabOlbgPage() {
  if (process.env.LAB_PREVIEW !== '1') notFound()
  const card = fromDbTipster(row(), now())
  const sinEvidencia = fromDbTipster({ ...row(), slug: 'abc', olbgEvidence: undefined, olbgObserved: null, olbgJoinedAt: '2020-12-14' } as unknown as TipsterReadRow, now())
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 12 }}>
      <h1 style={{ fontSize: 16 }}>Lab OLBG (datos sintéticos, sin DB)</h1>
      <p style={{ fontSize: 12, color: '#666' }}>Tarjeta con muestra observada: etiquetas normales + detalle «Historial parcial» desplegable.</p>
      <TipsterRow tipster={card} />
      <p style={{ fontSize: 12, color: '#666', marginTop: 16 }}>Tarjeta sin evidencia vigente (alta conocida):</p>
      <TipsterRow tipster={sinEvidencia} />
    </main>
  )
}
