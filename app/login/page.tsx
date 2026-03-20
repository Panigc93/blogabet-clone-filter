import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signCookie } from '@/lib/auth'
import LoginForm from './LoginForm'

async function loginAction(formData: FormData) {
  'use server'
  const password = formData.get('password') as string
  const sitePassword = process.env.SITE_PASSWORD!
  const secret = process.env.AUTH_SECRET!

  if (password !== sitePassword) {
    redirect('/login?error=1')
  }

  const token = await signCookie(sitePassword, secret)
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
        <LoginForm action={loginAction} error={!!searchParams.error} />
      </div>
    </div>
  )
}
