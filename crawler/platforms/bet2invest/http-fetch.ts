// Bet2Invest HTTP adapter (preparatory; NEVER exercised against the web by
// this change: tests use a local loopback server only). The contract is
// enforced by this code, not promised by the caller:
// - Destination: only URLs whose origin equals the EXPLICIT allowedOrigin
//   and whose path starts with /tipsters/performance-stats/ are requested;
//   anything else throws BEFORE a connection is opened. A non-loopback
//   origin must be https.
// - Redirects are never followed (a 3xx is returned as its status).
// - Limits: hard total timeout and hard body-size cap, both required; on
//   breach the request is destroyed and an Error is thrown (the runner
//   treats a throw as an access signal and pauses).
// - Fixed headers: one User-Agent, Accept-Encoding: identity, no cookies;
//   a response with a non-identity Content-Encoding is rejected.
// - Every request is logged (target, remote address, status, bytes,
//   elapsed) so the effective destination can be verified after the fact.
import http from 'http'
import https from 'https'
import type { Fetcher } from './crawl'

export const PRODUCTION_ORIGIN = 'https://bet2invest.com'
const ALLOWED_PATH_PREFIX = '/tipsters/performance-stats/'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export interface HttpFetchConfig {
  allowedOrigin: string // REQUIRED, no default; e.g. PRODUCTION_ORIGIN
  timeoutMs: number // REQUIRED total timeout per request
  maxBytes: number // REQUIRED body cap
  userAgent: string // REQUIRED, sent verbatim
}

export interface RequestLogEntry {
  url: string
  remoteAddress: string | null
  status: number | null
  bytes: number
  elapsedMs: number
  error: string | null
}

export interface HttpFetcher {
  fetch: Fetcher
  effective: Readonly<HttpFetchConfig> // frozen resolved limits
  log: ReadonlyArray<RequestLogEntry>
}

export function createHttpFetcher(config: HttpFetchConfig): HttpFetcher {
  const origin = new URL(config.allowedOrigin)
  if (origin.origin !== config.allowedOrigin) throw new Error('allowedOrigin must be a bare origin (scheme://host[:port])')
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && LOOPBACK.has(origin.hostname))) {
    throw new Error('allowedOrigin must be https (http only for loopback)')
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw new Error('invalid timeoutMs')
  if (!Number.isInteger(config.maxBytes) || config.maxBytes <= 0) throw new Error('invalid maxBytes')
  if (!config.userAgent.trim()) throw new Error('invalid userAgent')
  const effective = Object.freeze({ ...config })
  const log: RequestLogEntry[] = []

  const fetch: Fetcher = (rawUrl) =>
    new Promise((resolve, reject) => {
      let url: URL
      try {
        url = new URL(rawUrl)
      } catch {
        reject(new Error(`rejected URL (unparseable)`))
        return
      }
      if (url.origin !== effective.allowedOrigin || !url.pathname.startsWith(ALLOWED_PATH_PREFIX) || url.username || url.password || url.hash) {
        reject(new Error(`rejected URL outside allowed destination: ${url.origin}${url.pathname}`))
        return
      }
      const started = Date.now()
      const entry: RequestLogEntry = { url: url.href, remoteAddress: null, status: null, bytes: 0, elapsedMs: 0, error: null }
      log.push(entry)
      let settled = false
      const finish = (err: Error | null, value?: { status: number; body: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        entry.elapsedMs = Date.now() - started
        if (err) {
          entry.error = err.message
          reject(err)
        } else resolve(value!)
      }
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request(
        url,
        {
          method: 'GET',
          agent: false, // no connection reuse across requests
          headers: { 'user-agent': effective.userAgent, 'accept-encoding': 'identity', accept: 'text/html' },
        },
        (res) => {
          entry.status = res.statusCode ?? null
          entry.remoteAddress = res.socket.remoteAddress ?? null
          const enc = String(res.headers['content-encoding'] ?? 'identity').toLowerCase()
          if (enc !== 'identity') {
            req.destroy()
            finish(new Error(`rejected Content-Encoding: ${enc}`))
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => {
            entry.bytes += c.length
            if (entry.bytes > effective.maxBytes) {
              req.destroy()
              finish(new Error(`body exceeds maxBytes (${effective.maxBytes})`))
              return
            }
            chunks.push(c)
          })
          res.on('end', () => finish(null, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
          res.on('error', (e) => finish(e))
          res.on('aborted', () => finish(new Error('response aborted (connection reset)')))
        },
      )
      const timer = setTimeout(() => {
        req.destroy()
        finish(new Error(`timeout after ${effective.timeoutMs} ms`))
      }, effective.timeoutMs)
      req.on('error', (e) => finish(e))
      req.end()
    })

  return { fetch, effective, log }
}
