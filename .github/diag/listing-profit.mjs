// One-off diagnostic: a single GET of the catalog listing from the Actions runner.
// No database, no imports, no writes, no retries. Prints status, timing and counts only:
// never the cookie, never the response body, never header values except content-type.
const cookie = process.env.BLOGABET_COOKIE
if (!cookie) {
  console.log('BLOGABET_COOKIE is not set: nothing requested')
  process.exit(1)
}

// Same query the official /tipsters page sends (literal brackets, same order), order=profit, lastActive=3 (3 months), picksOver=500 (Over 500 picks), the combination the user reported working.
const url =
  'https://blogabet.com/tipsters/?f[language]=all&f[pickType]=all&f[sport]=all&f[sportPercent]=&f[leagues]=all&f[picksOver]=500&f[lastActive]=3&f[bookiesUsed]=null&f[bookiePercent]=&f[order]=profit&f[start]=0'

const headers = {
  'accept': '*/*',
  'accept-language': 'en,es-ES;q=0.9,es;q=0.8',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://blogabet.com/tipsters',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
}

console.log(`runner: ${process.env.RUNNER_OS ?? 'unknown'} node ${process.version}`)
console.log(`GET order=profit lastActive=3 picksOver=500 start=0 at ${new Date().toISOString()}`)
const t0 = Date.now()
try {
  const res = await fetch(url, { headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(60000) })
  const body = await res.text()
  console.log(JSON.stringify({
    status: res.status,
    ms: Date.now() - t0,
    bodyLength: body.length,
    tipsterBlocks: (body.match(/tipster-block/g) ?? []).length,
    contentType: res.headers.get('content-type'),
    headerNames: [...res.headers.keys()].sort(),
  }))
  process.exitCode = res.ok ? 0 : 1
} catch (err) {
  console.log(JSON.stringify({ error: err instanceof Error ? err.name : 'unknown', ms: Date.now() - t0 }))
  process.exitCode = 1
}
