'use client'
import { useEffect, useState } from 'react'
import { readCompareSelection, toggleCompareSlug, COMPARE_CHANGED_EVENT } from '@/lib/compareClient'
import { COMPARE_MAX } from '@/lib/compare'

export function CompareToggle({ slug, name }: { slug: string; name: string }) {
  const [selected, setSelected] = useState(false)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const sync = () => {
      const sel = readCompareSelection()
      setSelected(sel.some(s => s.slug === slug))
      setFull(sel.length >= COMPARE_MAX)
    }
    sync()
    window.addEventListener(COMPARE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(COMPARE_CHANGED_EVENT, sync)
  }, [slug])

  const disabled = !selected && full

  return (
    <label
      title={disabled ? `Máximo ${COMPARE_MAX} tipsters para comparar` : 'Añadir a la comparación'}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, color: disabled ? '#bbb' : '#5b8dd9', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => toggleCompareSlug(slug, name)}
        style={{ width: 14, height: 14, cursor: disabled ? 'not-allowed' : 'pointer', accentColor: '#5b8dd9' }}
      />
      Comparar
    </label>
  )
}
