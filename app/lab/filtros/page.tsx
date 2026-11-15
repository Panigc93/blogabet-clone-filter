import { FilterBar } from '@/components/FilterBar'

// Laboratorio visual del selector de fuente: renderiza la barra en los dos
// estados sin necesidad de base de datos (los filtros solo-BB aparecen
// desactivados y el precio señalado cuando la fuente es Tipstrr).
export default function LabFiltros() {
  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <p style={{ padding: '10px 14px 0', fontSize: 12, color: '#666' }}>
        Fuente Blogabet (default, comportamiento actual intacto):
      </p>
      <FilterBar searchParams={{ tipo: 'paid', priceMin: '10', priceMax: '40' }} />
      <p style={{ padding: '14px 14px 0', fontSize: 12, color: '#666' }}>
        Fuente Tipstrr (años BB / resets / picks free desactivados, precio señalado como no aplicable en GBP):
      </p>
      <FilterBar searchParams={{ tipo: 'paid', platform: 'tipstrr' }} />
    </div>
  )
}
