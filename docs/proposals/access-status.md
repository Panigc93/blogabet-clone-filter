# Propuesta: evidencia de muestras por tipster (pestañas de Statistics + listado)

Fecha: 2026-10-30 · Estado: PROPUESTA sin aplicar (no hay migración, ni cableado al crawler, ni corrida)

> Corrección 2026-10-30 (segunda revisión): esta propuesta ya NO clasifica el
> acceso al perfil. Las pestañas PAID/PRIVATE de Statistics clasifican
> **muestras de picks**, no el acceso. El parser emite `sampleVisibility` +
> `profileAccessStatus: 'unknown'` (siempre).

## Qué problema resuelve (y cuál no)

**Resuelve:** hoy `is_paid` se deriva SOLO del texto del listado (regex de
precio). La página `/blog/stats`, que el crawler ya descarga a diario, lleva
evidencia adicional — pestañas ALL / PAID / PRIVATE con sus tablas Archive —
que hoy se descarta. Registrarla de forma estructurada distingue:

- tipsters con **muestra de picks privados** (pestaña PRIVATE con filas) — hoy
  invisibles para la base;
- tipsters **sin cuota en el listado pero con muestra de pago** (pestaña PAID
  con filas) — hoy pasan como "free";
- tipsters con **evidencia ambigua o ausente** — etiquetados `unknown`, nunca
  asumidos free.

**NO resuelve:** la verificación de acceso **anónimo/público**. Véase la
siguiente sección.

## El hueco que sigue abierto: acceso anónimo/público

- El crawler corre con la cookie de sesión del dueño: todo su markup es "lo
  que ve un usuario logueado". Ninguna evidencia de esta propuesta (ni de
  cualquier otra vía con sesión) establece si un perfil es visible sin cuenta
  o seguible gratuitamente.
- Un bookmarklet ejecutado en el navegador logueado de Juan tampoco: el DOM
  autenticado no puede verificar el acceso anónimo. No se ofrece como
  comprobación final de acceso público.
- Las rutas externas **probadas** desde aquí (fetch directo de un perfil y
  fetch vía servicio público, una petición cada una, 2026-10-30) respondieron
  403. Solo se afirma de esas rutas probadas; no se generaliza a toda ruta.
- Conclusión honesta: los 50 candidatos MYS (y el pool de 344) permanecen
  **"seguibilidad pública/gratuita SIN VERIFICAR"**. Esta propuesta reduce el
  trabajo manual futuro sobre evidencia de muestras; no sustituye la
  comprobación pública, que sigue pendiente de una vía autorizada real.

## Método de consulta: el mismo que el repo ya usa

El parser trabaja únicamente sobre HTML que los crawlers actuales ya
descargan en su corrida diaria autorizada (`crawler/crawl.ts`,
`crawler/stats.ts`). Cero rutas nuevas, cero peticiones nuevas, cero patrones
de consulta inventados. Nada se ha ejecutado contra Blogabet.

## Semántica exacta de la salida

`deriveSampleEvidence` devuelve:

| Campo | Valores | Significado |
|---|---|---|
| `sampleVisibility` | `subscribe-offer` | El listado muestra botón SUBSCRIBE/precio/plan especial (oferta de pago en el listado) |
| | `paid-sample` | Pestaña PAID con meses de muestra de picks de pago |
| | `private-sample` | Pestaña PRIVATE con meses de muestra de picks privados |
| | `alltime-only` | Solo ALL-TIME visible en la sesión del crawler; ALL **no demuestra** que la muestra sea FREE (aviso ya presente en `lab/collector/mys-export.js`) |
| | `unknown` | Evidencia ausente o ambigua |
| `profileAccessStatus` | siempre `'unknown'` | Esta evidencia no puede clasificar el acceso al perfil |
| `reason` | texto | Trazabilidad humana de la decisión |

Reglas conservadoras: precio en listado → `subscribe-offer`; PRIVATE con
filas → `private-sample`; PAID con filas pese a listado sin cuota →
`paid-sample`; pestaña presente pero vacía → `unknown`; listado sin cuota +
solo ALL-TIME → `alltime-only`; todo lo demás → `unknown`.

## Procedencia de los selectores (solo evidencia, nada inferido)

| Selector | Procedencia |
|---|---|
| `#alltimeStatsTab`, `#paidStatsTab` | Los usa `crawler/stats.ts` en la corrida diaria que ya funciona |
| `#{type}-{seccion}-StatsTabContent` (alltime/paid/private) | Documentado en `blogabet-scripts/BLOGABET_CONTEXT.md` (selectores de Statistics) y usado por `lab/collector/mys-export.js` |
| ~~`#privateStatsTab`~~ | **Eliminado**: era una inferencia por simetría sin evidencia documentada. Hay un test que garantiza que NO se reconoce |

Significado documentado de las pestañas (BLOGABET_CONTEXT.md): PAID = "solo
picks de pago (si el tipster tiene paid picks)"; PRIVATE = "solo picks
privados, en algunos casos alternativa a PAID". Ambas son categorías de
muestra; ninguna es una clasificación del acceso al perfil.

Las fixtures del test son **sintéticas**, construidas desde esa documentación.
No son capturas vivas y no certifican el markup real: si la primera corrida
real muestra otra forma, el parser degrada a `unknown`.

## Nota sobre `last_pick_at` (semántica preservada)

`last_pick_at` NO es la fecha real del último pick: `crawl.ts` la fija a la
hora de la corrida cuando el tipster aparece en el listado de activos del mes
(LAST_ACTIVE ≤ 1) y COALESCE la conserva entre corridas (`docs/ARCHITECTURE.md`
lo declara proxy explícitamente). Cualquier filtro de "actividad" sobre ese
campo significa "visto activo por el crawler", no "publicó un pick". Esta
propuesta no cambia ese campo.

## Diseño (implementado en esta rama, sin cablear)

- `crawler/access.ts`
  - `parseStatsTabs(html)` → presencia de pestañas alltime/paid/private y
    filas de Archive por pestaña, solo con los selectores con procedencia
    documentada arriba.
  - `deriveSampleEvidence({listingIsPaid, listingPrice, stats})` →
    `{ sampleVisibility, profileAccessStatus: 'unknown', reason }`.
  - `TAB_EVIDENCE_CAVEAT` — texto fijo que cualquier consumidor (UI, export,
    ranking) debe mostrar: evidencia de muestras con sesión del crawler; no
    clasifica acceso al perfil ni certifica acceso anónimo/público/gratuito.
- `tests/crawler/access.test.ts` — 14 tests con fixtures sintéticas desde la
  documentación, incluida la garantía de que `#privateStatsTab` (inferido) NO
  se reconoce y de que ningún camino devuelve un `profileAccessStatus` distinto
  de `unknown`.

## Cableado pendiente (requiere decisión de Juan)

1. **Migración Drizzle**: columnas nuevas y nulables, p.ej.
   `sample_visibility text`, `sample_evidence text`,
   `profile_access_status text` (siempre 'unknown' por ahora),
   `tabs_checked_at timestamptz`. Nada de valores inventados: todo lo no
   recalculado queda NULL/unknown.
2. **stats.ts**: tras cada `fetchStats`, llamar a `parseStatsTabs` sobre el
   HTML ya descargado (cero peticiones nuevas) y guardar evidencia + razón +
   fecha. En `crawl.ts` puede registrarse la evidencia del listado por separado.
3. **UI**: insignia de evidencia de muestras en la ficha del tipster, siempre
   con `TAB_EVIDENCE_CAVEAT` visible. Nunca una insignia "público/free".
4. **Backfill**: solo con la siguiente corrida diaria que Juan decida
   permitir; las filas no activas quedan `unknown` hasta su próxima
   actualización.

## Verificación hecha aquí

- `npx vitest run` → 36/36 (22 de master + 14 nuevos).
- `npx tsc --noEmit` limpio.
- Cero peticiones a Blogabet; cero ejecución del crawler; cero cambios en
  schema, master, producción o auth.
