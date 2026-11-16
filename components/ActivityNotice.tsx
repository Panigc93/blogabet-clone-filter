import { activityWarning } from '@/lib/activity-query'

export function ActivityNotice({ months, unknown }: { months?: number; unknown?: boolean }) {
  const detail = activityWarning(months, unknown)
  if (!detail) return null
  return <div role="note" style={{ margin: '8px 0', padding: '8px 12px', background: '#eef6ff', border: '1px solid #b8d5f3', borderRadius: 4, fontSize: 13 }}>
    {unknown ? 'No tenemos una publicación reciente comprobada. Eso no significa que el tipster esté inactivo.' : 'Se muestran perfiles con actividad comprobada en el periodo. Puede faltar información; BB usa su catálogo de activos.'}
    <details style={{ marginTop: 4 }}><summary style={{ cursor: 'pointer' }}>Cobertura y fechas</summary><p style={{ margin: '6px 0 0' }}>{detail}</p></details>
  </div>
}
