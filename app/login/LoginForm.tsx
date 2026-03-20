'use client'
import { useState } from 'react'

export default function LoginForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>
  error: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <>
      {error && (
        <p style={{ color: '#eb6379', marginBottom: 12, fontSize: 13 }}>Contraseña incorrecta.</p>
      )}
      <form action={action}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            name="password"
            type={show ? 'text' : 'password'}
            placeholder="Contraseña"
            required
            style={{ width: '100%', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '8px 36px 8px 10px', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0, fontSize: 15 }}
          >
            <i className={`fa ${show ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
        </div>
        <button
          type="submit"
          style={{ width: '100%', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '9px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Entrar
        </button>
      </form>
    </>
  )
}
