import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signCookie } from '@/lib/auth'

async function loginAction(formData: FormData) {
  'use server'
  const password = formData.get('password') as string
  const sitePassword = process.env.SITE_PASSWORD!
  const secret = process.env.AUTH_SECRET!

  if (password !== sitePassword) {
    redirect('/login?error=1')
  }

  const token = signCookie(sitePassword, secret)
  const cookieStore = await cookies()
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  redirect('/')
}

export default function LoginPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fira Sans, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 4, padding: '32px 40px', boxShadow: '0 2px 8px rgba(0,0,0,.1)', minWidth: 300 }}>
        <h2 style={{ color: '#82daca', fontWeight: 900, marginBottom: 20, fontSize: 22 }}>TIPSTERS</h2>
        {searchParams.error && (
          <p style={{ color: '#eb6379', marginBottom: 12, fontSize: 13 }}>Contraseña incorrecta.</p>
        )}
        <form action={loginAction}>
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            style={{ width: '100%', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '8px 10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            style={{ width: '100%', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '9px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
