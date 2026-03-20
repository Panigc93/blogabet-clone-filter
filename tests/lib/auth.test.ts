import { describe, it, expect } from 'vitest'
import { signCookie, verifyCookie } from '@/lib/auth'

describe('auth cookie helpers', () => {
  const password = 'testpassword'
  const secret = 'aaaabbbbccccddddeeeeffffgggghhhh'

  it('signCookie returns a 64-char hex string', async () => {
    const token = await signCookie(password, secret)
    expect(typeof token).toBe('string')
    expect(token.length).toBe(64)
  })

  it('verifyCookie returns true for a valid token', async () => {
    const token = await signCookie(password, secret)
    expect(await verifyCookie(token, password, secret)).toBe(true)
  })

  it('verifyCookie returns false for wrong password', async () => {
    const token = await signCookie(password, secret)
    expect(await verifyCookie(token, 'wrongpassword', secret)).toBe(false)
  })

  it('verifyCookie returns false for wrong secret', async () => {
    const token = await signCookie(password, secret)
    expect(await verifyCookie(token, password, 'wrongsecret'.padEnd(32, 'x'))).toBe(false)
  })

  it('verifyCookie returns false for empty string', async () => {
    expect(await verifyCookie('', password, secret)).toBe(false)
  })
})
