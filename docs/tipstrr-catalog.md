# Catálogo Tipstrr: cobertura observada y estrategia de indexación

Sonda puntual 2026-11-15 (una sesión, navegación normal con la cuenta del
usuario, sin automatismo recurrente): portada → /tipsters (404) → /football
→ 1 click "Load more" → sonda acotada del endpoint público que usa la
propia página (~10 lecturas en total, 3-5 s entre lecturas).

## Qué ofrece el catálogo

- No hay listado global: `/tipsters` es 404. El catálogo se organiza por
  deporte (19 en el footer: football, horse-racing, tennis, american-football,
  baseball, basketball, boxing, cricket, darts, e-sports, golf, greyhounds,
  handball, ice-hockey, mixed-martial-arts, rugby-league, rugby-union,
  snooker, volleyball).
- Cada página de deporte tiene su listado "Find a professional tipster" con
  filtros: ORDER BY (Tipstrr rating / Profit / ROI), TIPSTER TYPE
  (Premium / Free), PERIOD (mes / 3 / 6 / 12 meses / all time).
- El endpoint público que usa la propia UI:
  `/api/portfolio?filterType=0&sportId=<n>&profit=0&roi=0&tips=45&minOdds=1.2&maxOdds=1000&portfolioType=2&order=0&period=3&page=<n>`
  devuelve un array JSON de 15 slugs por página. Sin total ni hasMore:
  el tamaño solo se conoce llegando a la primera página vacía.
- Las tarjetas del listado dan por tipster y periodo: ROI, profit, win rate,
  avg odds, tips/semana, precio y "since".
- Escala declarada por Tipstrr: 8.95M+ tips procesados, "thousands of
  tipsters".

## Cobertura medida (football, sportId=1)

Con los filtros por defecto del listado (tips ≥ 45 en el periodo, últimos 3
meses, cuotas 1.2-1000, Premium+Free, orden Tipstrr rating):

- páginas 1-6 completas (15 slugs), página 7 con 4, página 8 vacía
- **94 tipsters de fútbol** cumplen esos criterios por defecto hoy
- El número depende de los filtros: es la vista por defecto, no el universo
  total de perfiles (inactivos o con pocos tips recientes no aparecen)

## Estrategia de indexación propuesta (free + pago, sin elegir ganadores)

Objetivo: indexar para filtrar/comparar, no seleccionar apuestas.

1. **Pase de catálogo acotado por deporte**: enumerar el listado público
   (15 slugs/página, una lectura cada ~15 s como en el pase autorizado) hasta
   la primera página vacía, guardando slug + métricas de tarjeta. Football:
   ~7 lecturas. Los 19 deportes: desconocido hasta medirlos igual; razonable
   esperar del mismo orden o menos por deporte minoritario. Una pasada por
   deporte, sin repetición.
2. **Perfil completo (/stats) por criterios transparentes de cobertura**, no
   por yield: p. ej. todos los del listado con historia ≥ 1 año y actividad
   reciente; el umbral exacto se fija al ver la distribución del paso 1. Las
   capturas de perfil siguen el patrón ya validado (captura fechada →
   loader → upsert).
3. **Actualización**: cuestión separada y posterior (cadencia explícita).

Restricciones reales encontradas: sin listado global ni totales (el coste de
enumeración se conoce solo midendo por deporte); los perfiles sin actividad
reciente suficiente no aparecen en la vista por defecto (cobertura del
índice limitada a lo que el listado expone con los filtros elegidos);
términos de Tipstrr pendientes para cualquier extracción recurrente (la
sonda puntual con cuenta propia es el patrón ya usado y aprobado).
