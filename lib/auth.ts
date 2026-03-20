import { createHmac, timingSafeEqual } from 'crypto'

export function signCookie(password: string, secret: string): string {
  return createHmac('sha256', secret).update(password).digest('hex')
}

export function verifyCookie(token: string, password: string, secret: string): boolean {
  if (!token) return false
  const expected = signCookie(password, secret)
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
