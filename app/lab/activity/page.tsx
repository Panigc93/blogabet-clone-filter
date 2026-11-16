import { FilterBar } from '@/components/FilterBar'
import { ActivityNotice } from '@/components/ActivityNotice'

export default function ActivityPreview({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return <>
    <FilterBar searchParams={{ platform: 'golazobets', activity: '1', ...searchParams }} />
    <main style={{ maxWidth: 1100, margin: '16px auto', padding: '0 12px' }}>
      <h2>Vista previa del filtro de actividad</h2>
      <ActivityNotice months={1} unknown={searchParams.activity === 'unknown'} />
      <p>Vista de revisión sin base de datos. No muestra resultados ni implica recogida completa.</p>
    </main>
  </>
}
