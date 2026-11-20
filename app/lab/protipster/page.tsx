import { notFound } from 'next/navigation'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster, type TipsterReadRow } from '@/components/tipster-card-model'
import type { Tipster } from '@/db/schema'

// Lab route: the REAL table row component fed with the ProTipster rows as
// the import mapping produces them from the real 2026-11-20 captures
// (heroico, sonicc, almo7tarif). Not a sync, not deployed data.
const base: Tipster = {
  id: 0,
  platform: 'protipster',
  slug: '',
  name: '',
  profitUnit: 'protipster-units',
  priceCurrency: 'eur',
  signupAt: null,
  capturedAt: new Date('2026-11-20T11:50:00Z'),
  avatarUrl: null,
  flagUrl: null,
  countryCode: null,
  isPaid: false,
  price: null,
  sinceYear: null,
  picks: 0,
  profit: null,
  yield: null,
  verifiedPct: null,
  isVerified: false,
  followers: null,
  lastPickAt: null,
  resetCount: 0,
  lastResetAt: null,
  updatedAt: new Date('2026-11-20T11:50:00Z'),
  picks6mAvg: null,
  yield3m: null,
  yield6m: null,
  yield12m: null,
  picksFree3mAvg: null,
  yieldFree3m: null,
  statsUpdatedAt: new Date('2026-11-20T11:50:00Z'),
  sourcePortfolioId: null,
  sourceUrl: null,
  accessClass: null,
  accessEvidence: null,
  accessObservedAt: null,
  accessPrice: null,
}

// Valores exactamente los que produce protipsterRowToInsert sobre las
// capturas reales (tests/crawler/protipster-to-db.test.ts).
const ROWS: Tipster[] = [
  {
    ...base,
    id: -1, slug: 'heroico', name: 'heroico',
    countryCode: 'VE', sinceYear: 2019, signupAt: new Date('2019-02-04T14:29:08Z'),
    picks: 1031, profit: '5510.000', yield: '3.85', followers: 341,
    picks6mAvg: '111.83', yield3m: '9.92', yield6m: '6.40', yield12m: '3.34',
    sourcePortfolioId: 136241, sourceUrl: 'https://www.protipster.es/tipster/heroico',
  },
  {
    ...base,
    id: -2, slug: 'sonicc', name: 'Sonicc',
    // Sandbox preview: avatar cacheado en local porque el sandbox no alcanza
    // protipster.es; la ruta de import guarda la URL original
    // (https://www.protipster.es/uploads/avatars/5b4bd6d533539.120.png).
    avatarUrl: '/lab/protipster/avatar/sonicc.png',
    countryCode: 'DE', sinceYear: 2018, signupAt: new Date('2018-05-26T13:28:35Z'),
    picks: 3609, profit: '-7418.000', yield: '-2.38', followers: 53,
    picks6mAvg: '79.50', yield3m: '9.96', yield6m: '9.96', yield12m: '7.74',
    sourcePortfolioId: 100841, sourceUrl: 'https://www.protipster.es/tipster/sonicc',
  },
  {
    ...base,
    id: -3, slug: 'almo7tarif', name: 'ALMO7TARIF',
    // Mismo caché local que sonicc; URL original:
    // https://www.protipster.es/uploads/avatars/V5BY8RD3yZUFEWX3.120.png
    avatarUrl: '/lab/protipster/avatar/almo.png',
    countryCode: 'MA', sinceYear: 2021, signupAt: new Date('2021-03-28T18:44:29Z'),
    picks: 1513, profit: '-5066.000', yield: '-2.24', followers: 39,
    picks6mAvg: '252.17', yield3m: '-2.24', yield6m: '-2.24', yield12m: '-8.65',
    sourcePortfolioId: 252502, sourceUrl: 'https://www.protipster.es/tipster/almo7tarif',
  },
]

export const dynamic = 'force-dynamic'

export default function LabProtipsterPage() {
  // Dev-only preview: never published to production (fixture data, test notice).
  if (process.env.NODE_ENV === 'production') notFound()
  const rows = ROWS.map(r => fromDbTipster(r as TipsterReadRow))
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px' }}>
      <div style={{ background: '#d9edf7', border: '1px solid #bce8f1', color: '#31708f', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
        <strong>Vista de prueba</strong>: componente real de la tabla de Superblogabet alimentado con las filas que
        produce la ruta de import ProTipster sobre las capturas reales del 20-nov-2026. No es una sincronización ni
        una integración desplegada.
      </div>
      {rows.map((r) => (
        <TipsterRow key={r.name} tipster={r} />
      ))}
    </div>
  )
}
