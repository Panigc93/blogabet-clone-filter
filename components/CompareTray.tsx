'use client'
import { useEffect, useState } from 'react'
import { CompareItem, readCompareSelection, removeCompareSlug, clearCompareSelection, COMPARE_CHANGED_EVENT } from '@/lib/compareClient'

export function CompareTray() {
  const [items, setItems] = useState<CompareItem[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const sync = () => setItems(readCompareSelection())
    sync()
    window.addEventListener(COMPARE_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (items.length === 0) return null

  const href = `/comparar?slugs=${items.map(i => i.slug).join(',')}`

  return (
    <div className="compare-tray" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 14, zIndex: 9998, background: '#333', color: '#fff', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.35)', maxWidth: '95vw', flexWrap: 'wrap' }}>
      {!collapsed && (
      <div className="compare-tray-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map(item => (
          <span key={item.slug} className="compare-tray-chip" title={item.name} style={{ background: '#4a4a4a', borderRadius: 4, padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {item.name}
            <button
              onClick={() => removeCompareSlug(item.slug)}
              title="Quitar de la comparación"
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      )}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Mostrar selección' : 'Ocultar selección'}
        style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline', flexShrink: 0 }}
      >
        {collapsed ? `Mostrar (${items.length})` : 'Ocultar'}
      </button>
      <a
        href={items.length >= 2 ? href : undefined}
        aria-disabled={items.length < 2}
        title={items.length < 2 ? 'Selecciona al menos 2 tipsters' : 'Ver comparación'}
        style={{ background: items.length >= 2 ? '#5b8dd9' : '#777', color: '#fff', borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none', cursor: items.length >= 2 ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
      >
        Comparar ({items.length})
      </a>
      <button
        onClick={clearCompareSelection}
        style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
      >
        Limpiar
      </button>
    </div>
  )
}
