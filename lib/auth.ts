// Uses Web Crypto API — available in both Node.js 18+ and Edge Runtime

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function signCookie(password: string, secret: string): Promise<string> {
  return hmacHex(password, secret)
}

export async function verifyCookie(token: string, password: string, secret: string): Promise<boolean> {
  if (!token || token.length !== 64) return false
  const expected = await hmacHex(password, secret)
  let diff = 0
  for (let i = 0; i < 64; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
