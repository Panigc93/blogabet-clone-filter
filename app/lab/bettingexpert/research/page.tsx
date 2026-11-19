import { notFound } from 'next/navigation'
import { BEPrivateResearch } from '@/components/BEPrivateResearch'
import { privateResearchEnabled } from '@/lib/bettingexpert-research/evidence'
import { queryPrivateResearch, ResearchInputError } from '@/lib/bettingexpert-research/query'

export const dynamic = 'force-dynamic'
export default function BEResearchPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!privateResearchEnabled()) notFound()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) if (typeof value === 'string') params.set(key, value)
  try { return <BEPrivateResearch data={queryPrivateResearch(params)} /> }
  catch (error) {
    if (error instanceof ResearchInputError) return <main style={{ padding: 30 }}><h1>Revisión Bettingexpert</h1><p>{error.message}</p><a href="/lab/bettingexpert/research">Volver a la primera página</a></main>
    return <main style={{ padding: 30 }}><h1>Evidencia privada no disponible</h1><p>La revisión no puede mostrarse sin verificar sus archivos. No se usa un dato anterior o sin validar.</p></main>
  }
}
