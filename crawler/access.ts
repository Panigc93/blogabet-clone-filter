import * as cheerio from 'cheerio'

// ─── Evidencia de pestañas de Statistics y del listado ─────────────────────
//
// Qué extrae: evidencia de MUESTRAS de picks, NO el estado de acceso del
// perfil. Las pestañas PAID/PRIVATE de Statistics clasifican muestras de
// picks ("PAID - Solo picks de pago", "PRIVATE - Solo picks privados":
// blogabet-scripts/BLOGABET_CONTEXT.md, sección Statistics), no el acceso al
// perfil. Un tipster con pestaña PRIVATE puede ser público; uno sin ella
// puede ser de pago. Por eso `profileAccessStatus` es SIEMPRE 'unknown'.
//
// Método de consulta: el MISMO que el repo ya usa. El parser trabaja sobre el
// HTML que los crawlers actuales ya descargan en su corrida diaria autorizada
// (sesión del dueño; crawler/crawl.ts y crawler/stats.ts). No añade rutas,
// peticiones ni patrones de consulta nuevos.
//
// Lo que NO puede establecer: acceso anónimo/público. Todo el markup es "lo
// que ve la sesión del dueño". Ningún valor de aquí certifica que un perfil
// sea visible sin cuenta o seguible gratuitamente. Esa verificación sigue
// pendiente y ninguna herramienta con DOM logueado (crawler o bookmarklet)
// puede suplirla.
//
// Procedencia de los selectores (solo markup con evidencia, nada inferido):
//   - '#alltimeStatsTab' y '#paidStatsTab': los usa crawler/stats.ts en la
//     corrida diaria que ya funciona.
//   - Familia '#{type}-{seccion}-StatsTabContent' (type alltime|paid|private):
//     documentada en blogabet-scripts/BLOGABET_CONTEXT.md (selectores de
//     Statistics) y usada por lab/collector/mys-export.js.
//   - '#privateStatsTab' NO se acepta: era una inferencia por simetría sin
//     evidencia documentada; eliminado. Ante markup no reconocido, 'unknown'.

export interface StatsTabEvidence {
  hasAlltimeTab: boolean
  hasPaidTab: boolean
  hasPrivateTab: boolean
  paidArchiveRows: number
  privateArchiveRows: number
}

function countArchiveRows($: cheerio.CheerioAPI, scopeSelectors: string[]): number {
  for (const scope of scopeSelectors) {
    const rows = $(`${scope} [data-stats="archive"] tbody tr`).length
    if (rows > 0) return rows
  }
  return 0
}

function tabExists($: cheerio.CheerioAPI, type: 'alltime' | 'paid' | 'private'): boolean {
  if (type === 'alltime') {
    // stats.ts: perfil free = tabla de archivo sin wrapper (fallback sin scope)
    return $(`#alltimeStatsTab`).length > 0
      || $(`[id^="alltime-"][id$="-StatsTabContent"]`).length > 0
      || $(`[data-stats="archive"] tbody tr`).length > 0
  }
  if (type === 'paid') {
    return $(`#paidStatsTab`).length > 0
      || $(`[id^="paid-"][id$="-StatsTabContent"]`).length > 0
  }
  // private: SOLO la familia documentada en BLOGABET_CONTEXT.md
  return $(`[id^="private-"][id$="-StatsTabContent"]`).length > 0
}

export function parseStatsTabs(html: string): StatsTabEvidence {
  const $ = cheerio.load(html)
  const paidScopes = ['#paidStatsTab', '[id^="paid-"][id$="-StatsTabContent"]']
  const privateScopes = ['[id^="private-"][id$="-StatsTabContent"]']
  return {
    hasAlltimeTab: tabExists($, 'alltime'),
    hasPaidTab: tabExists($, 'paid'),
    hasPrivateTab: tabExists($, 'private'),
    paidArchiveRows: countArchiveRows($, paidScopes),
    privateArchiveRows: countArchiveRows($, privateScopes),
  }
}

// Visibilidad de la MUESTRA según la evidencia. Ninguno de estos valores es
// una clasificación del acceso al perfil.
export type SampleVisibility =
  | 'subscribe-offer'  // el listado muestra botón SUBSCRIBE / precio / plan especial
  | 'paid-sample'      // pestaña PAID con meses de muestra de picks de pago
  | 'private-sample'   // pestaña PRIVATE con meses de muestra de picks privados
  | 'alltime-only'     // solo ALL-TIME visible en la sesión del crawler (ALL no demuestra FREE)
  | 'unknown'          // evidencia ausente o ambigua

export interface SampleEvidenceInput {
  listingIsPaid: boolean             // de parseBlocks (botón SUBSCRIBE/precio/plan especial)
  listingPrice: string | null        // precio detectado en el listado, si lo hay
  stats: StatsTabEvidence | null     // null = la página de stats no se pudo obtener
}

export interface SampleEvidenceResult {
  sampleVisibility: SampleVisibility
  profileAccessStatus: 'unknown'     // siempre: esta evidencia no clasifica el acceso
  reason: string
}

// Reglas (conservadoras: cualquier duda → 'unknown'):
// 1. Precio/suscripción en el listado → 'subscribe-offer' (evidencia directa
//    del listado de que hay una oferta de pago; no dice nada del acceso).
// 2. Pestaña PRIVATE con filas → 'private-sample' (muestra de picks privados).
// 3. Pestaña PAID con filas pese a listado sin cuota → 'paid-sample'.
// 4. Pestaña presente pero sin filas → 'unknown' (ambigua).
// 5. Listado sin cuota + solo ALL-TIME → 'alltime-only' (ALL no demuestra FREE).
// 6. Todo lo demás → 'unknown'.
export function deriveSampleEvidence(input: SampleEvidenceInput): SampleEvidenceResult {
  if (input.listingIsPaid) {
    return {
      sampleVisibility: 'subscribe-offer',
      profileAccessStatus: 'unknown',
      reason: input.listingPrice
        ? `El listado muestra suscripción de ${input.listingPrice}€/mes (oferta de pago en el listado; no clasifica el acceso al perfil)`
        : 'El listado muestra plan de pago sin precio literal (oferta en el listado; no clasifica el acceso al perfil)',
    }
  }
  const s = input.stats
  if (!s) {
    return {
      sampleVisibility: 'unknown',
      profileAccessStatus: 'unknown',
      reason: 'Página de stats no disponible; solo hay evidencia del listado (sin cuota detectada)',
    }
  }
  if (s.privateArchiveRows > 0) {
    return {
      sampleVisibility: 'private-sample',
      profileAccessStatus: 'unknown',
      reason: `Pestaña PRIVATE con ${s.privateArchiveRows} meses de muestra de picks privados (categoría de muestra, no acceso al perfil)`,
    }
  }
  if (s.paidArchiveRows > 0) {
    return {
      sampleVisibility: 'paid-sample',
      profileAccessStatus: 'unknown',
      reason: `Pestaña PAID con ${s.paidArchiveRows} meses de muestra de picks de pago pese a listado sin cuota (categoría de muestra, no acceso al perfil)`,
    }
  }
  if (s.hasPrivateTab || s.hasPaidTab) {
    return {
      sampleVisibility: 'unknown',
      profileAccessStatus: 'unknown',
      reason: 'Pestaña PAID/PRIVATE presente pero sin filas de archivo: evidencia ambigua',
    }
  }
  if (s.hasAlltimeTab) {
    return {
      sampleVisibility: 'alltime-only',
      profileAccessStatus: 'unknown',
      reason: 'Solo ALL-TIME visible en la sesión del crawler; ALL no demuestra que la muestra sea FREE (aviso de mys-export.js)',
    }
  }
  return {
    sampleVisibility: 'unknown',
    profileAccessStatus: 'unknown',
    reason: 'Sin evidencia suficiente en stats',
  }
}

// Aviso fijo para cualquier consumo de esta evidencia (UI, exports, rankings).
export const TAB_EVIDENCE_CAVEAT =
  'Evidencia de muestras (pestañas de Statistics) y del listado, vista con la sesión del crawler. No clasifica el acceso al perfil ni certifica acceso anónimo, público o gratuito.'
