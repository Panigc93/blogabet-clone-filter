'use client'
import { useState } from 'react'

// Avatar con fallback a iniciales si la URL falla al cargar (origen externo,
// p. ej. golazobets.com): nunca un hueco roto en la card.
export function AvatarImg({ url, name, initials }: { url: string; name: string; initials: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#82daca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18 }}>
        {initials}
      </div>
    )
  }
  return (
    <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} style={{ width: 76, height: 76, minWidth: 76, minHeight: 76, flexShrink: 0, borderRadius: '50%', objectFit: 'cover', display: 'block', marginLeft: 15 }} />
  )
}
