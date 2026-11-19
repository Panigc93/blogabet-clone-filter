import { NextRequest, NextResponse } from 'next/server'
import { privateResearchEnabled } from '@/lib/bettingexpert-research/evidence'
import { queryPrivateResearch, ResearchInputError } from '@/lib/bettingexpert-research/query'

export const dynamic = 'force-dynamic'
export function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store, private' }
  if (!privateResearchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
  try { return NextResponse.json(queryPrivateResearch(request.nextUrl.searchParams), { headers }) }
  catch (error) {
    return NextResponse.json({ error: error instanceof ResearchInputError ? error.message : 'Evidencia privada no disponible' }, { status: error instanceof ResearchInputError ? 400 : 503, headers })
  }
}
