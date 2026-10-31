import Link from 'next/link'
import { db } from '@/db'
import { tipsters, Tipster } from '@/db/schema'
import { parseCompareSlugs, COMPARE_MAX } from '@/lib/compare'
import { inArray } from 'drizzle-orm'

interface PageProps {
  searchParams: Record<string, string | undefined>
}

function fmtNum(v: string | null, decimals = 1, suffix = ''): string {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  return `${n >= 0 && suffix === '%' ? '+' : ''}${n.toFixed(decimals)}${suffix}`
}

function fmtDate(value: Date | string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getUTCFullYear()}`
}

interface Metric {
  label: string
  value: (t: Tipster) => string
  numeric?: (t: Tipster) => number | null
}

const METRICS: Metric[] = [
  { label: 'Tipo',           value: t => (t.isPaid ? `Pago (${t.price ?? '—'}€/mes)` : 'Free') },
  { label: 'Desde',          value: t => (t.sinceYear != null ? String(t.sinceYear) : '—') },
  { label: 'Picks',          value: t => String(t.picks), numeric: t => t.picks },
  { label: 'Profit',         value: t => (t.profit != null ? fmtNum(t.profit, 0) : '—'), numeric: t => (t.profit != null ? Number(t.profit) : null) },
  { label: 'Yield',          value: t => (t.yield != null ? fmtNum(t.yield, 1, '%') : '—'), numeric: t => (t.yield != null ? Number(t.yield) : null) },
  { label: 'Yield 3m',       value: t => fmtNum(t.yield3m, 1, '%'), numeric: t => (t.yield3m != null ? Number(t.yield3m) : null) },
  { label: 'Yield 6m',       value: t => fmtNum(t.yield6m, 1, '%'), numeric: t => (t.yield6m != null ? Number(t.yield6m) : null) },
  { label: 'Yield 12m',      value: t => fmtNum(t.yield12m, 1, '%'), numeric: t => (t.yield12m != null ? Number(t.yield12m) : null) },
  { label: 'Picks/mes 6m',   value: t => (t.picks6mAvg != null ? fmtNum(t.picks6mAvg, 0) : '—'), numeric: t => (t.picks6mAvg != null ? Number(t.picks6mAvg) : null) },
  { label: 'Picks free/mes 3m', value: t => (t.picksFree3mAvg != null ? fmtNum(t.picksFree3mAvg, 0) : '—'), numeric: t => (t.picksFree3mAvg != null ? Number(t.picksFree3mAvg) : null) },
  { label: 'Yield free 3m',  value: t => fmtNum(t.yieldFree3m, 1, '%'), numeric: t => (t.yieldFree3m != null ? Number(t.yieldFree3m) : null) },
  { label: 'Picks verificados', value: t => (t.verifiedPct != null ? `${Math.round(Number(t.verifiedPct))}%` : '—'), numeric: t => (t.verifiedPct != null ? Number(t.verifiedPct) : null) },
  { label: 'Cuenta verificada', value: t => (t.isVerified ? 'Sí' : 'No') },
  { label: 'Seguidores',     value: t => String(t.followers), numeric: t => t.followers },
  { label: 'Resets',         value: t => `${t.resetCount}${t.lastResetAt ? ` (último ${fmtDate(t.lastResetAt)})` : ''}` },
  { label: 'Stats actualizados', value: t => fmtDate(t.statsUpdatedAt) },
]

function bestIndexes(ts: Tipster[], numeric: (t: Tipster) => number | null): Set<number> {
  let best: number | null = null
  const idx = new Set<number>()
  ts.forEach((t, i) => {
    const v = numeric(t)
    if (v == null) return
    if (best == null || v > best) {
      best = v
      idx.clear()
      idx.add(i)
    } else if (v === best) {
      idx.add(i)
    }
  })
  // Highlight only when values actually differ
  const values = new Set(ts.map(t => numeric(t)).filter(v => v != null))
  return values.size > 1 ? idx : new Set<number>()
}

export default async function CompararPage({ searchParams }: PageProps) {
  const { slugs, rejected } = parseCompareSlugs(searchParams.slugs)

  let rows: Tipster[] = []
  if (slugs.length > 0) {
    const found = await db.select().from(tipsters).where(inArray(tipsters.slug, slugs))
    rows = slugs.map(s => found.find(t => t.slug === s)).filter((t): t is Tipster => t != null)
  }
  const missing = slugs.filter(s => !rows.some(t => t.slug === s))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Link href="/" style={{ color: '#5b8dd9', fontSize: 13, textDecoration: 'none' }}>← Volver al listado</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#333', margin: 0 }}>Comparar tipsters</h1>
      </div>

      {rejected.length > 0 && (
        <p style={{ fontSize: 12, color: '#b00' }}>
          Valores ignorados (inválidos, duplicados o por encima del máximo de {COMPARE_MAX}): {rejected.join(', ')}
        </p>
      )}
      {missing.length > 0 && (
        <p style={{ fontSize: 12, color: '#b00' }}>
          No encontrados en la base de datos: {missing.join(', ')}
        </p>
      )}

      {rows.length < 2 ? (
        <p style={{ fontSize: 14, color: '#555' }}>
          Selecciona al menos 2 tipsters en el listado (casilla «Comparar» de cada tarjeta) para ver la comparación.
        </p>
      ) : (
        <>
        <p style={{ fontSize: 13, color: '#6c757d', margin: '0 0 6px' }}>Desliza la tabla para ver todas las métricas.</p>
        <div
          role="region"
          aria-label="Tabla de comparación de tipsters, desplazable horizontalmente"
          tabIndex={0}
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', border: '1px solid #dbe1e8', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #4dbfa2', color: '#777', fontSize: 12 }}></th>
                {rows.map(t => (
                  <th key={t.slug} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #4dbfa2', minWidth: 150 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#333' }}>{t.name}</div>
                    <a href={`https://${t.slug}.blogabet.com`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 400, color: '#eb6379', textDecoration: 'none' }}>
                      {t.slug}.blogabet.com
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(m => {
                const best = m.numeric ? bestIndexes(rows, m.numeric) : new Set<number>()
                return (
                  <tr key={m.label}>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid #eee', color: '#777', fontSize: 12, whiteSpace: 'nowrap' }}>{m.label}</td>
                    {rows.map((t, i) => (
                      <td
                        key={t.slug}
                        style={{
                          padding: '7px 12px', borderBottom: '1px solid #eee', textAlign: 'center', fontWeight: best.has(i) ? 700 : 400,
                          color: best.has(i) ? '#2b4a6f' : '#333', background: best.has(i) ? '#eef3f9' : undefined,
                        }}
                      >
                        {m.value(t)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          El valor más alto de cada métrica numérica se resalta; más alto no implica mejor. Stats mensuales sobre meses cerrados; no incluyen el mes en curso.
        </p>
        </>
      )}
    </div>
  )
}
