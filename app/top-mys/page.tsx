import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters } from '@/lib/query'
import { and } from 'drizzle-orm'
import Link from 'next/link'
import {
  rankTopMys,
  MYS_MIN_PICKS,
  MYS_MIN_YIELD,
  MYS_ACTIVITY_MONTHS,
  MYS_TOP_N,
} from '@/lib/mysScore'

export const dynamic = 'force-dynamic'

function fmt(v: string | null, suffix = ''): string {
  if (v === null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(1).replace('.', ',')}${suffix}`
}

export default async function TopMys() {
  // Pool MYS global: gratis (sin cuota detectada), >=100 picks, yield >=11%,
  // activo en los ultimos MYS_ACTIVITY_MONTHS meses (segun last_pick_at del crawler).
  const where = buildFilters({
    tipo: 'free',
    minPicks: MYS_MIN_PICKS,
    minYield: MYS_MIN_YIELD,
    activityMonths: MYS_ACTIVITY_MONTHS,
  })
  const rows = await db.select().from(tipsters).where(and(...where))
  const now = new Date()
  const ranked = rankTopMys(rows, t => t, now, MYS_TOP_N)
  const freshest = rows.reduce<Date | null>(
    (acc, r) => (r.updatedAt && (!acc || r.updatedAt > acc) ? r.updatedAt : acc),
    null,
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px' }}>
      <p><Link href="/">← Volver al listado</Link></p>
      <h2 style={{ marginTop: 0 }}>Top MYS</h2>
      <p style={{ color: '#555', maxWidth: 760 }}>
        Los {ranked.length} candidatos preseleccionados mejor puntuados de un pool de <strong>{rows.length}</strong> que cumplen
        los umbrales MYS en el computo global: al menos {MYS_MIN_PICKS} picks, yield de al menos
        el {MYS_MIN_YIELD}%, sin cuota de pago detectada y activos en los ultimos {MYS_ACTIVITY_MONTHS} meses.
        El orden mezcla yield historico (20%), yield 6m (20%) y 3m (10%), muestra (15%),
        volumen de picks/mes (15%), % de picks verificados (10%) y recencia (10%);
        cada reset penaliza un 15% y, usando la media mensual de picks de 6 meses como estimacion del
        volumen reciente, los yields recientes puntuan neutros por debajo de unos 30 picks estimados en 6 meses.
      </p>
      <p style={{ color: '#888', fontSize: 12, maxWidth: 760 }}>
        La puntuacion es una heuristica discrecional, sin validacion predictiva ni ajuste por riesgo.
        Cifras historicas tal como las publica Blogabet: no certifican rendimiento futuro ni son
        recomendacion de apuesta. La seguibilidad publica/gratuita conviene confirmarla en el perfil
        de cada tipster. El ambito global basta para el criterio; el desglose por categoria o liga
        queda fuera de esta vista (la base no guarda ese desglose).
        {freshest && <> Datos actualizados por ultima vez: {freshest.toISOString().slice(0, 16).replace('T', ' ')} UTC.</>}
      </p>
      <table className="table table-striped" style={{ background: '#fff' }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Tipster</th>
            <th style={{ textAlign: 'right' }}>Yield</th>
            <th style={{ textAlign: 'right' }}>6m</th>
            <th style={{ textAlign: 'right' }}>Picks</th>
            <th style={{ textAlign: 'right' }}>Picks/mes</th>
            <th style={{ textAlign: 'right' }}>Verif.</th>
            <th style={{ textAlign: 'right' }}>Seg.</th>
            <th style={{ textAlign: 'right' }}>Puntuacion</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ item: t, score }, i) => (
            <tr key={t.id} data-slug={t.slug}>
              <td>{i + 1}</td>
              <td>
                <a href={`https://${t.slug}.blogabet.com`} target="_blank" rel="noreferrer">
                  <strong>{t.name}</strong>
                </a>
                {t.resetCount > 0 && (
                  <span title={`Estadisticas reseteadas ${t.resetCount} vez/veces`} style={{ marginLeft: 6, color: '#b58900', fontSize: 11 }}>
                    {t.resetCount} reset{t.resetCount > 1 ? 's' : ''}
                  </span>
                )}
                {t.isVerified && <i className="fa fa-check" style={{ color: '#4dbfa2', marginLeft: 6 }} title="Cuenta verificada" />}
              </td>
              <td style={{ textAlign: 'right' }}>{fmt(t.yield, '%')}</td>
              <td style={{ textAlign: 'right' }}>{fmt(t.yield6m, '%')}</td>
              <td style={{ textAlign: 'right' }}>{t.picks}</td>
              <td style={{ textAlign: 'right' }}>{fmt(t.picks6mAvg)}</td>
              <td style={{ textAlign: 'right' }}>{t.verifiedPct === null ? '—' : `${Number(t.verifiedPct).toFixed(0)}%`}</td>
              <td style={{ textAlign: 'right' }}>{t.followers}</td>
              <td style={{ textAlign: 'right' }}>{score.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
