# Propuesta: estado de acceso por tipster (free / paid / private / unknown)

Fecha: 2026-10-30 · Estado: PROPUESTA sin aplicar (no hay migración, ni cableado al crawler, ni corrida)

## Qué problema resuelve

La clasificación MYS y el filtro `tipo=free` usan `is_paid`, derivado SOLO del
texto del listado (regex de precio en el bloque de suscripción). Eso no distingue:

- tipsters con pestaña **PRIVATE** (picks solo para invitados) — hoy invisibles
  para la base;
- tipsters **free en el listado pero con picks de pago** (pestaña PAID en sus
  stats) — hoy pasan como "free";
- perfiles cuyo estado **no se puede conocer** — hoy se asume free por ausencia
  de precio, que es justo lo que no queremos asumir.

Además, verificar a mano los 50 perfiles del Top MYS serían 50 comprobaciones
manuales. El crawler ya descarga a diario las dos fuentes de markup necesarias;
grabar la evidencia automáticamente elimina ese trabajo manual.

## Lo que NO hace (límites explícitos)

- **No verifica acceso anónimo/público.** El crawler corre con la cookie de
  sesión del dueño; todo el markup que ve es "lo que ve un usuario logueado".
  Ningún valor de esta propuesta certifica que un perfil sea visible sin cuenta
  o seguible gratuitamente de forma pública. Esa verificación sigue pendiente
  y los 50 candidatos MYS permanecen "seguibilidad sin verificar".
- **No cambia datos existentes ni ejecuta nada.** Sin migración aplicada, sin
  corrida del crawler, sin escrituras en Neon, sin invocar workflows.
- **No adivina.** Ante markup no reconocido, pestañas vacías o ausencia de la
  página de stats, el estado es `unknown`, nunca `free` por defecto.

## Evidencia usada (ya descargada por los crawlers actuales)

| Fuente | Dato | Estado del conocimiento |
|---|---|---|
| Listado `/tipsters/` (crawl.ts) | Botón FOLLOW vs SUBSCRIBE-precio / plan especial | Parseado hoy (`is_paid`, `price`) |
| Stats `/blog/stats` (stats.ts) | Pestañas ALL / PAID / PRIVATE y filas de su tabla Archive | Página ya descargada a diario; pestañas ALL/PAID ya usadas; PRIVATE documentada en `blogabet-scripts/BLOGABET_CONTEXT.md` (`#private-{sección}-StatsTabContent`) |

Conocimiento honesto sobre PRIVATE: la documentación de `blogabet-scripts`
dice "solo picks privados, en algunos casos alternativa a PAID", y el wrapper
`#privateStatsTab` se infiere por simetría con `#paidStatsTab` (no está
confirmado en markup vivo: el parser acepta ambas familias de ids y degrada a
`unknown` si no reconoce nada). La primera corrida real puede revelar markup
distinto; las fixtures del test son documentadas, no capturas vivas.

## Diseño (implementado en esta rama, sin cablear)

- `crawler/access.ts`
  - `parseStatsAccess(html)` → presencia de scopes alltime/paid/private y
    filas de Archive por pestaña. Acepta los wrappers `#alltimeStatsTab`,
    `#paidStatsTab`, `#privateStatsTab` y la familia documentada
    `#{type}-{sección}-StatsTabContent`.
  - `deriveAccessStatus({listingIsPaid, listingPrice, stats})` →
    `{ status: 'free'|'paid'|'private'|'unknown', reason }` con reglas
    conservadoras (precio en listado → paid; PRIVATE con filas → private;
    PAID con filas pese a listado free → paid con contradicción señalada;
    free solo con evidencia completa; cualquier duda → unknown).
  - `ACCESS_STATUS_CAVEAT` — texto fijo que cualquier consumidor (UI, export,
    ranking) debe mostrar: el estado no certifica acceso anónimo.
- `tests/crawler/access.test.ts` — 12 tests con fixtures construidas solo con
  markup documentado.

## Cableado pendiente (requiere decisión de Juan)

1. **Migración Drizzle**: columnas nuevas y nulables, p.ej.
   `access_status text`, `access_evidence text`, `access_checked_at timestamptz`.
   Nada de valores inventados: todo lo no recalculado queda NULL/unknown.
2. **stats.ts**: tras cada `fetchStats`, llamar a `parseStatsAccess` sobre el
   HTML ya descargado (cero peticiones nuevas) y guardar estado + razón +
   fecha. En `crawl.ts` puede registrarse la evidencia del listado por separado.
3. **UI**: insignia en la ficha del tipster y opción de filtro, siempre con
   `ACCESS_STATUS_CAVEAT` visible.
4. **Backfill**: se produce solo con la siguiente corrida diaria que Juan
   decida permitir; las filas no activas quedan `unknown` hasta su próxima
   actualización.

## Verificación hecha aquí

- `npx vitest run` → 34/34 (22 de master + 12 nuevos).
- `npx tsc --noEmit` limpio.
- Cero peticiones a Blogabet; cero ejecución del crawler; cero cambios en
  schema, master, producción o auth.
