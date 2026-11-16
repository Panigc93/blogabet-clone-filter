import { FilterBar } from '@/components/FilterBar'
import { activityWarning } from '@/lib/activity-query'

export default function ActivityPreview({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return <>
    <FilterBar searchParams={{ platform: 'golazobets', activity: '1', ...searchParams }} />
    <main style={{ maxWidth: 1100, margin: '16px auto', padding: '0 12px' }}>
      <h2>Vista previa del filtro de actividad</h2>
      <p style={{ padding: 12, background: '#eef6ff', border: '1px solid #b8d5f3', borderRadius: 4 }}>
        {activityWarning(1, searchParams.activity === 'unknown')}
      </p>
      <p>Vista de revisión sin base de datos. No muestra resultados ni implica recogida completa.</p>
    </main>
  </>
}
