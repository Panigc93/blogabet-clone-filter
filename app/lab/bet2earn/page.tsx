import { notFound } from 'next/navigation'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster, type TipsterReadRow } from '@/components/tipster-card-model'
import type { Tipster } from '@/db/schema'
import { consolidateBet2earnCapture } from '@/crawler/platforms/bet2earn/parse'
import { bet2earnRowToInsert } from '@/crawler/platforms/bet2earn/to-db'
import { bet2earnSourceUrl } from '@/crawler/platforms/bet2earn/types'
import profileAndreas from '@/tests/crawler/fixtures/bet2earn/profile-andreaskloft.json'
import historyAndreas from '@/tests/crawler/fixtures/bet2earn/history-andreaskloft.json'
import profileFabian from '@/tests/crawler/fixtures/bet2earn/profile-fabian.json'
import historyFabian from '@/tests/crawler/fixtures/bet2earn/history-fabian.json'

// Lab route: the REAL table row component fed with Bet2Earn rows exactly as
// the import mapping produces them from the real 2026-11-21 captures
// (ANDREASKLOFT WINAMAX premium, fabian rivero free). Not a sync, not
// deployed data. Visual check of color, photo, activity cell and period
// traces before any preview deploy.
function realInsert(slug: string, listSource: 'premium' | 'free', profileBody: unknown, historyBody: unknown): Tipster {
  const row = consolidateBet2earnCapture({
    slug,
    capturedAt: '2026-11-21T05:00:00Z',
    listSource,
    profileBody,
    historyBody,
  })
  row.sourceUrl = bet2earnSourceUrl(slug)
  const m = bet2earnRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug })
  if (!m.ok) throw new Error(`lab fixture ${slug}: ${m.reason}`)
  return {
    ...m.insert,
    updatedAt: new Date('2026-11-21T05:00:00Z'),
  } as Tipster
}

const ROWS: Tipster[] = [
  realInsert('andreaskloft winamax', 'premium', profileAndreas, historyAndreas),
  realInsert('fabian rivero', 'free', profileFabian, historyFabian),
]

export const dynamic = 'force-dynamic'

export default function LabBet2earnPage() {
  // Dev-only preview: never published to production (fixture data, test notice).
  if (process.env.NODE_ENV === 'production') notFound()
  const rows = ROWS.map(r => fromDbTipster(r as TipsterReadRow))
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px' }}>
      <div style={{ background: '#d9edf7', border: '1px solid #bce8f1', color: '#31708f', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
        <strong>Vista de prueba</strong>: componente real de la tabla de Superblogabet alimentado con las filas que
        produce la ruta de import Bet2Earn sobre las capturas reales del 21-nov-2026. No es una sincronización ni
        una integración desplegada.
      </div>
      {rows.map((r) => (
        <TipsterRow key={r.name} tipster={r} />
      ))}
    </div>
  )
}
