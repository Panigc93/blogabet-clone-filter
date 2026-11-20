import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Dev-only avatar cache for the lab preview: the sandbox cannot reach
// protipster.es, so the lab page serves these local copies. Production
// returns 404 like the rest of the lab route; the import route stores the
// original protipster.es URLs, never these.
export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['sonicc.png', 'almo.png'])

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { name } = await params
  if (!ALLOWED.has(name)) notFound()
  const buf = await readFile(join(process.cwd(), 'lab-assets/protipster', name))
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
}
