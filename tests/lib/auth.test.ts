import { describe, it, expect } from 'vitest'
import { signCookie, verifyCookie } from '@/lib/auth'

describe('auth cookie helpers', () => {
  const password = 'testpassword'
  const secret = 'aaaabbbbccccddddeeeeffffgggghhhh'

  it('signCookie returns a non-empty string', () => {
    const token = signCookie(password, secret)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('verifyCookie returns true for a valid token', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, password, secret)).toBe(true)
  })

  it('verifyCookie returns false for wrong password', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, 'wrongpassword', secret)).toBe(false)
  })

  it('verifyCookie returns false for wrong secret', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, password, 'wrongsecret'.padEnd(32, 'x'))).toBe(false)
  })

  it('verifyCookie returns false for empty string', () => {
    expect(verifyCookie('', password, secret)).toBe(false)
  })
})
