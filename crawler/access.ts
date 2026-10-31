import * as cheerio from 'cheerio'

// ─── Access-status evidence from markup the crawler ALREADY downloads ────────
//
// Propósito: clasificar el acceso de cada tipster (free/paid/private/unknown)
// usando SOLO el HTML que los crawlers actuales ya descargan:
//   1. el bloque del listado /tipsters/ (botón FOLLOW vs SUBSCRIBE-precio)
//   2. la página /blog/stats de cada perfil (pestañas ALL/PAID/PRIVATE)
//
// NO verifica el acceso ANÓNIMO: el crawler corre con la cookie de sesión del
// dueño. Un estado 'free' significa "sin cuota detectada y con picks visibles
// en la sesión del crawler", nunca "visible sin cuenta". La seguibilidad
// pública anónima requiere verificación aparte y hoy sigue sin verificar.
//
// Fuentes de markup (offline, documentadas en Panigc93/blogabet-scripts):
//   - BLOGABET_CONTEXT.md: selectores #alltime-{seccion}-StatsTabContent,
//     #paid-{seccion}-StatsTabContent, #private-{seccion}-StatsTabContent
//     (PRIVATE = "solo picks privados, en algunos casos alternativa a PAID").
//   - crawler/stats.ts usa los wrappers #alltimeStatsTab / #paidStatsTab.
// El parser acepta AMBAS familias de ids y, ante ausencia o ambigüedad,
// devuelve 'unknown' en lugar de adivinar.

export interface StatsAccessEvidence {
  hasAlltimeScope: boolean
  hasPaidScope: boolean
  hasPrivateScope: boolean
  paidArchiveRows: number
  privateArchiveRows: number
}

function countArchiveRows($: cheerio.CheerioAPI, scopeSelectors: string[]): number {
  for (const scope of scopeSelectors) {
    const rows = $(`${scope} [data-stats="archive"] tbody tr`).length
    if (rows > 0) return rows
    // Si el scope existe pero sin filas de archivo, seguir mirando otras familias
  }
  return 0
}

function scopeExists($: cheerio.CheerioAPI, type: 'alltime' | 'paid' | 'private'): boolean {
  if (type === 'alltime') {
    // Los perfiles free no llevan wrapper: alltime existe si hay tabla de archivo sin scope
    return $(`#alltimeStatsTab`).length > 0
      || $(`[id^="alltime-"][id$="-StatsTabContent"]`).length > 0
      || $(`[data-stats="archive"] tbody tr`).length > 0
  }
  return $(`#${type}StatsTab`).length > 0
    || $(`[id^="${type}-"][id$="-StatsTabContent"]`).length > 0
}

export function parseStatsAccess(html: string): StatsAccessEvidence {
  const $ = cheerio.load(html)
  const paidScopes = ['#paidStatsTab', '[id^="paid-"][id$="-StatsTabContent"]']
  const privateScopes = ['#privateStatsTab', '[id^="private-"][id$="-StatsTabContent"]']
  return {
    hasAlltimeScope: scopeExists($, 'alltime'),
    hasPaidScope: scopeExists($, 'paid'),
    hasPrivateScope: scopeExists($, 'private'),
    paidArchiveRows: countArchiveRows($, paidScopes),
    privateArchiveRows: countArchiveRows($, privateScopes),
  }
}

export type AccessStatus = 'free' | 'paid' | 'private' | 'unknown'

export interface AccessInput {
  listingIsPaid: boolean        // de parseBlocks (botón SUBSCRIBE/precio/plan especial)
  listingPrice: string | null   // precio detectado en el listado, si lo hay
  stats: StatsAccessEvidence | null  // null = la página de stats no se pudo obtener
}

export interface AccessResult {
  status: AccessStatus
  reason: string
}

// Reglas (conservadoras: cualquier duda → 'unknown'):
// 1. Precio/suscripción en el listado → 'paid' (evidencia directa del listado).
// 2. Pestaña PRIVATE con filas reales → 'private' (picks solo para invitados).
// 3. Pestaña PAID con filas reales pese a listado free → 'paid' (contradicción señalada).
// 4. Listado free + stats presentes sin filas paid/private → 'free'.
// 5. Todo lo demás (sin stats, pestañas vacías, ausencias) → 'unknown'.
export function deriveAccessStatus(input: AccessInput): AccessResult {
  if (input.listingIsPaid) {
    return {
      status: 'paid',
      reason: input.listingPrice
        ? `Listado muestra suscripción de ${input.listingPrice}€/mes`
        : 'Listado muestra plan de pago sin precio literal',
    }
  }
  const s = input.stats
  if (!s) {
    return { status: 'unknown', reason: 'Página de stats no disponible; solo hay evidencia del listado (sin cuota)' }
  }
  if (s.privateArchiveRows > 0) {
    return { status: 'private', reason: `Pestaña PRIVATE con ${s.privateArchiveRows} meses de picks privados` }
  }
  if (s.paidArchiveRows > 0) {
    return { status: 'paid', reason: `Pestaña PAID con ${s.paidArchiveRows} meses de picks de pago pese a listado sin cuota` }
  }
  if (s.hasPrivateScope || s.hasPaidScope) {
    return { status: 'unknown', reason: 'Pestaña PAID/PRIVATE presente pero sin filas de archivo: ambiguo' }
  }
  if (s.hasAlltimeScope) {
    return { status: 'free', reason: 'Listado FOLLOW sin cuota y stats sin pestañas de pago/privado' }
  }
  return { status: 'unknown', reason: 'Sin evidencia suficiente en stats' }
}

// Aviso fijo para cualquier consumo de estos estados (UI, exports, rankings).
export const ACCESS_STATUS_CAVEAT =
  'Estado derivado de markup visible con la sesión del crawler. No certifica acceso anónimo ni público; la seguibilidad pública/gratuita requiere verificación aparte.'
