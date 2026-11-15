# Catálogo Tipstrr: cobertura observada y estrategia de indexación

Sonda 2026-11-15 con la sesión de la cuenta registrada (lease de navegador,
liberado al terminar). Este documento distingue lo OBSERVADO verbatim de lo
INFERIDO, tras la corrección de 15-11-2026 16:47 CET.

## Auditoría real de solicitudes (sesión ~15:44-15:47 CET)

Navegación normal de páginas: portada, /tipsters (404), /football, 1 click
"Load more" (la propia UI pidió page=2). Además, sondas directas mías al
endpoint del listado:

- Confirmadas (9): page=1 (200, 15), page=20 (200, 0), y en lotes con 5 s
  entre peticiones: pages 5/10/13/16 (200: 15/0/0/0) y pages 6/7/8
  (200: 15/4/0). La UI pidió page=2 (click "Load more") pero NO registré
  su tamaño. Páginas 3 y 4: NUNCA observadas.
- Inciertas (0-3): un intento a las 15:45:38 con tres fetch en un script
  falló sin salida capturable; el fallo fue muy probablemente de parseo
  ANTES de ejecutar (varios intentos idénticos fallaron así: "SyntaxError"
  en parseo, 0 peticiones), pero no puedo demostrarlo.
- Otros 5 intentos de sonda fallaron en parseo con 0 peticiones.

Total real: 9-12 peticiones al endpoint del listado + 4 cargas de página
normales. Excedió la autorización de UNA lectura puntual; no se repetirá
sin alcance explícito.

## Lo observado VERBATIM

URL que la propia página de fútbol generó con los filtros por defecto
(sin tocar ningún filtro; la pidió la UI al hacer "Load more"):

```
https://tipstrr.com/api/portfolio?filterType=0&sportId=1&profit=0&roi=0&tips=45&minOdds=1.2&maxOdds=1000&portfolioType=2&order=0&period=3&page=2
```

Respuesta: array JSON de slugs (15 por página). Sin total ni hasMore.
Es un endpoint público que usa la propia UI; NO es de los /api/authed/*
que devuelven 403.

Etiquetas de filtro visibles en /football (texto de la página, captura en
crawler/platforms/tipstrr/captures/2026-11-15-football-listing-default.txt):

- ORDER BY: Tipstrr rating / Profit / ROI
- TIPSTER TYPE: Premium / Free
- PERIOD: Last month / Last 3 months / Last 6 months / Last 12 months / All time

No hay listado global: /tipsters es 404. Catálogo por deporte (19 en el
footer). Portada: 8.950.620+ tips procesados, "thousands of tipsters".

## Lo INFERIDO (marcado como tal, no verificado)

1. `period=3` = "Last 3 months": consistente con las 5 opciones y con el
   select de la página de stats (option value=2 = "Last month"), pero
   ningún elemento de la página vincula el número con la etiqueta.
2. `tips=45` = umbral mínimo de tips en el periodo: por nombre del
   parámetro y contexto (junto a profit=0, roi=0, minOdds/maxOdds, que son
   umbrales). No hay control visible en la UI para ese valor; es un
   default oculto. Que sea "en el periodo" y no all-time tampoco está
   verificado.
3. `portfolioType=2`: el campo `type` de un objeto portfolio vale 1 en un
   tipster free (StatMind, sin membresía) y 2 en uno premium (TLE, con
   membresía). Si el parámetro del filtro usara el MISMO código, el
   listado por defecto sería solo premium — pero la UI muestra ambas
   opciones sin marcar por defecto, lo que sugiere que el default incluye
   ambos. NO resuelto: requiere una comparación dirigida en una pasada
   futura autorizada (1 petición con el filtro Free aplicado).
4. Conteo: RETIRADO el "94". Lo medido es: page=1 → 15, page=5 → 15,
   page=6 → 15, page=7 → 4, y vacío en pages 8, 10, 13, 16 y 20. Page=2
   la cargó la UI sin registrar tamaño; pages 3 y 4 nunca se observaron.
   El 94 era suma que ASUMÍA pages 2-4 completas (15 c/u) y sin solapes:
   ambas cosas inferidas, no medidas. Lo sostenible: al menos 49 entradas
   observadas en páginas sueltas, límite del listado entre page=7 (con
   datos) y page=8 (vacía), deduplicación NO verificada (los arrays de
   slugs no se conservaron; solo nombres visibles de la página 1).
5. "19 deportes" sí es verbatim: lista del footer en la captura guardada.

Conclusión honesta: el listado de fútbol por defecto tiene entre 49
(observado mínimo) y ~94 (si pages 2-4 van llenas y sin solape) entradas;
el número exacto exige una pasada autorizada que guarde los slugs.

## Actividad vs resultados (corrección del usuario 15-11-2026 16:49 CET)

El usuario separó dos cosas que el ranking por defecto mezcla: filtrar por
ACTIVIDAD (último pick publicado, p. ej. activos el último mes) y ordenar
por RESULTADOS (yield histórico). Evidencia de las capturas existentes:

- Las métricas del listado están calculadas sobre el PERIOD elegido
  (period=3 en la URL observada): no son yield histórico. El yield
  histórico sale del perfil /stats (ya cargado para TLE/StatMind).
- ORDER BY del listado solo ofrece Tipstrr rating / Profit / ROI: NO hay
  ordenación por actividad en el ranking.
- Actividad, lo que da cada fuente ya capturada:
  - Tarjeta del listado: "N Active tips" (cuenta, sin fecha) y
    "Avg. Tips/week" del periodo. Proxy débil de actividad actual.
  - Estado del perfil (/stats): sin campo de última actividad (verificado:
    no existe lastTip*); sí dateCreated exacto y buckets STATS_MONTH
    (último mes con actividad, precisión mensual).
  - Detalle por apuesta: existe el campo dateAdded (fecha de publicación,
    p. ej. 2026-11-13T07:05:04Z) junto a tipDate (evento,
    2026-11-14T12:30:00Z). OJO: una captura prueba que el campo EXISTE;
    no prueba que la apuesta capturada sea la más reciente publicada ni
    que la lista de completadas venga ordenada por publicación (sus
    filas traen fecha tipo evento). Obtener la última publicación real
    por tipster sigue siendo un hueco abierto.
- Huecos exactos para una pasada futura autorizada (sin consultas ahora):
  1. Si tips=0 es aceptado por el endpoint (quitar el mínimo oculto de 45)
     — 1 petición de validación.
  2. Semántica de portfolioType=2 (ambos tipos vs premium) — 1 petición
     con el filtro Free aplicado.
  3. Coste de last_pick_at por tipster: 1 detalle de la apuesta más
     reciente por perfil, o derivación mensual desde STATS_MONTH.
- El mínimo 45 y el periodo 3 meses son defaults de Tipstrr, NO política
  nuestra: no convertir el top de resultados a 3 meses en "el catálogo".

## Estrategia de indexación propuesta (free + pago, sin elegir ganadores)

Objetivo: indexar para filtrar/comparar, no seleccionar apuestas. Sin
criterios de exclusión por defecto (ni yield, ni antigüedad): se indexa lo
que el listado devuelve y la antigüedad/actividad se guardan como datos;
los umbrales los decide el usuario en la UI.

1. **Pasada acotada de fútbol primero**, con alcance exacto ANTES de
   ejecutar: páginas 1-8 del endpoint observado (techo 10 peticiones,
   incluyendo 1-2 de validación del filtro de tipo y el hueco tips=0),
   guardando arrays de slugs completos (así el conteo y la deduplicación
   quedan medidos, no asumidos) + métricas de tarjeta (ROI, profit,
   win rate, cuota media, tips/semana, precio, "since").
   Ritmo a acordar explícitamente con el usuario, explicando el riesgo de
   marcado/bloqueo de la cuenta por frecuencia.
   Con la corrección actividad/resultados: la pasada guarda también
   "Active tips" de cada tarjeta; la fecha exacta de última publicación y
   el yield histórico son datos de perfil (paso 3), no del listado.
2. **Otros deportes después**, cada uno con su propio techo medido (el
   tamaño se conoce solo llegando a la primera página vacía; fútbol costó
   7 páginas con datos). No proponer "19 deportes hasta vacío" como una
   sola operación: el coste es desconocido.
3. **Perfil completo (/stats)** como paso separado y posterior, con su
   propio alcance.
4. **Actualización periódica**: cuestión separada y posterior.

Restricciones reales: sin listado global ni totales; la vista por defecto
excluye lo que no cumpla sus umbrales ocultos (tips=45 según lo inferido);
términos de Tipstrr pendientes para cualquier extracción recurrente.
