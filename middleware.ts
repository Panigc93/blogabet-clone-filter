import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCookie } from '@/lib/auth'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value ?? ''
  const password = process.env.SITE_PASSWORD!
  const secret = process.env.AUTH_SECRET!

  if (!verifyCookie(token, password, secret)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/tipsters).*)'],
}
