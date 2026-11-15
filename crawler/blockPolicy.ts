// Shared block policy for the catalog and stats crawlers.
// A block (401/403/429) or an explicit challenge page stops the WHOLE run: no more
// requests, no more writes, previous data kept, exit 1.

export class HttpError extends Error {
  constructor(public status: number, statusText: string, prefix = 'Blogabet HTTP') {
    super(`${prefix} ${status} ${statusText}`)
  }
}

/** Raised when the site signals a block, rate limit or challenge. Never retried, aborts the run. */
export class BlockedError extends Error {
  constructor(public reason: string) {
    super(`Blocked: ${reason}`)
  }
}

export const NO_RETRY_STATUSES = [401, 403, 429]

// Conservative markers of a challenge/interstitial page. Only evaluated on a 200 body
// that produced NO parseable data, so a legitimate "no data" page does not match.
// Limit: a challenge page without these markers is not detected (it looks like "no data").
const CHALLENGE_MARKERS = [
  'just a moment', 'cf-chl', 'challenge-platform', 'cf-browser-verification',
  'captcha', 'attention required', 'access denied',
]

export function looksLikeChallenge(html: string): boolean {
  const h = html.toLowerCase()
  return CHALLENGE_MARKERS.some(m => h.includes(m))
}

export function assertNotBlocked(status: number, statusText: string): void {
  if (NO_RETRY_STATUSES.includes(status)) throw new BlockedError(`HTTP ${status} ${statusText}`)
}

export async function retryWithPolicy<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts: number,
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof BlockedError) throw err
      if (err instanceof HttpError && NO_RETRY_STATUSES.includes(err.status)) throw new BlockedError(err.message)
      if (attempt === maxAttempts) throw err
      const wait = attempt * 2000
      console.warn(`${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${wait / 1000}s... ${(err as Error).message}`)
      await sleep(wait)
    }
  }
  throw new Error('unreachable')
}
