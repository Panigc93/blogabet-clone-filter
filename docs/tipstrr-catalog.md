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

## Pasada de selección ejecutada (2026-11-15 15:02-15:25 UTC)

Selección del usuario: orden **ROI** (`order=2`), período **3 meses** (`period=3`), free (`portfolioType=1`) y premium (`portfolioType=2`) por separado, hasta **3 páginas** por tipo y deporte, los 19 deportes del menú. Parada por rama: página vacía o parcial. Ritmo: 15-23 s (tramo 1) y 10-16 s (tramo 2, aprobado por el usuario a las 16:11 CET). Condición de parada global (401/403/429/reto): **no se activó** — 0 respuestas no-200 en toda la pasada.

- Peticiones: 29 (leg1) + 34 (leg2) + 2 (MMA) = **65** (44 listing + 21 pageLoad), más 0-1 del intento descartado jsjob-1 (respuesta perdida con recarga).
- Resultado: **209 slugs únicos** (86 free + 123 premium, solape free∩premium = 0; 11 tipsters aparecen en más de un deporte).
- Combinaciones con resultados: 16 de 38; 22 vacías (0 tipsters con ≥45 tips bajo este filtro: cricket, darts, e-sports, greyhounds, handball, rugby-league, rugby-union, snooker, volleyball, golf free, MMA ambos, boxing ambos).
- Topes de 3 páginas alcanzados (cobertura truncada por decisión del usuario): football free y premium, horse-racing premium.
- MMA: el slug del listado del pie (`/mixed-martial-arts`) es un soft-404 (HTTP 200, título "Error | 404"); el real es `/mma` (sportId 11). Ambos tipos vacíos.
- Captura: `captures/2026-11-15-catalog-selection.json` (38 combinaciones con arrays de slugs por página y timestamp por petición). Validación: las 38 combinaciones pasan `validateCatalogCapture` sin issues.
- `tips=45` (mínimo oculto por defecto del sitio) se mantuvo tal cual: los vacíos significan "0 bajo este filtro", no "0 tipsters del deporte".

## Fase de stats por perfil (2026-11-15 15:27-16:00 UTC)

217 peticiones totales (208 del job a 10-16 s + 7 pre-job por fallo de regex de extracción + 2 de sondeo de parámetro `?period=`, ignorado por la página). Cero no-200 en el job. 209/209 perfiles capturados (208 + TLE reutilizado de 13:46 UTC). Auditoría de las capturas: sin emails, tokens ni datos de sesión/PII.

### Hallazgo: el overview de /stats NO es all-time por defecto

`overview.period` varía por perfil: 3 (70 perfiles), 4 (60), 5 (26), 6 (53). Verificado contra las 209 capturas: los periodos 3/4/5 NO son reproducibles desde buckets mensuales (ninguna de las ventanas de meses naturales ensayadas cuadra de forma general — últimos N cerrados por calendario, últimos N presentes en la serie, ni incluyendo el mes en curso). Esto descarta esas comparaciones; la semántica real (rodante de N días u otra) queda SIN VERIFICAR. El código 6 sí es all-time: 50 de 53 cierran al tip contra la suma de la serie mensual. El parámetro `?period=` de la URL es ignorado (sonda en vivo, 2 peticiones).

### Puerta por niveles (to-db.ts)

- VERIFICADO: overview all-time (period 6 o tips == suma de la serie) con todas las comprobaciones en verde → picks del overview, yield = roi del overview (cierra contra denominadores exactos).
- COBERTURA: overview rodante pero serie mensual desde el mes de alta → picks = suma exacta de la serie (los meses sin actividad no tienen fila y aportan 0; no-truncamiento probado por los 44 cierres exactos y series de 184 filas), yield all-time = Σprofit/Σstaked de la serie.
- CONTRADICCIÓN: overview all-time que no cierra contra la serie → picks de la serie si hay cobertura, yield null.
- RECHAZO: serie que empieza después del mes de alta (silencio ambiguo), o total ausente sin serie.

### Resultado de la ingesta aislada (PGlite, nunca Neon)

200 persistidos (84 free / 116 premium) en la base AISLADA con ids PROVISIONALES -900000-i (salvo TLE -221629 real): son FIXTURES de validación, NO payload importable a producción — el estado /stats no expone portfolioId en ningún campo (búsqueda exhaustiva sobre las capturas) y la convención exige PK = -portfolioId real. La identidad real se resuelve con los objetos por-tip de /results (como el 221629 de TLE), misma pasada acotada que la actividad. 9 rechazados por silencio ambiguo (alpheratz, beat-365, celtic-racing-tipster, chrisbestbets, forrest-jump, kensflat, ravi-predictz, steviebetscom, the-second-serve — capturas conservadas). 191 con yield all-time, 9 null (solo contradicciones numéricas reales). Script: `scripts/seed-tipstrr-catalog.ts`.

### Revisión 17:35 — desglose por nivel (instrumentado en el script)

- VERIFICADO 49: overview all-time + batería completa en verde → picks y yield del overview.
- COBERTURA 96: overview no all-time + serie desde el alta → picks = suma exacta, yield = Σprofit/Σstaked.
- CONTRADICCION 55 → reclasificada: 46 eran stake variable (advised != level, estructural, con tips/roi/profit cerrando contra la serie) → ahora yield calculado de la serie; 9 contradicciones numéricas reales (joydi, nieder, on-target-tips, on-the-money-tips, parabola-bets, shrewd-tips, svb-tips, thebanker, trust-me) → yield null, picks de la serie.
- RECHAZO 9: serie empieza tras el mes de alta y overview no all-time verificado.

Controles de cobertura aplicados: (1) primera fila mensual <= mes de alta; (2) igualdad exacta tips serie vs overview cuando el overview es all-time; (3) cierre roi = Σprofit/Σstaked ±0.05 y profit ±0.01 contra la serie; (4) meses sin actividad no generan fila (0 filas tips=0 en 4.271) y aportan 0 a la suma, así que los huecos intermedios NO corruptan el total — sí anulan ventanas de periodo vía periods.ts (complete=false); (5) sin truncamiento observado: series de hasta 184 filas y 44+ cierres exactos. Límite honesto: para perfiles con overview no all-time, la completitud es evidencia de mecanismo (mismo estado, misma serie), no prueba registro a registro.

Precio: las tarjetas guardadas del listado (football default) contienen ROI/odds/tips/winrate/profit pero NINGÚN precio de suscripción ("Join from £X" no aparece en el material capturado) → hueco confirmado sin red nueva.

### Huecos conocidos

- Precio de suscripción: NO está en el estado /stats (membershipTier null incluso en premium); solo en tarjetas del listado, no capturadas.
- Actividad último pick: dateAdded por tip solo en el detalle /tipster/<slug>/results (PORTFOLIO_TIP_CACHED). Opción preparada NO ejecutada: 1 lectura por perfil (~209, 35-55 min a 10-16 s); la ordenación "última publicación" NO está probada — verificar dateAdded descendente en primera página antes de usar max(dateAdded) como lastPickAt.
- Los 9 rechazados son perfiles cuya primera fila mensual cae 1 mes después del alta (probable primera actividad tardía, no truncamiento, pero ambiguo); recuperables con una fuente de total independiente.

### Actividad (último pick) — comprobación acotada PREVIA a cualquier pasada (NO ejecutada)

Antes de proponer 209 lecturas, resolver la semántica con 2-3 lecturas acotadas:
1. Elegir 2 perfiles del catálogo: uno con activeTips > 0 y otro con activeTips = 0 (ambos datos ya en las capturas /stats).
2. Leer /tipster/<slug>/results de cada uno (mismo ritmo 10-16 s) y extraer PORTFOLIO_TIP_CACHED: comprobar (a) que la primera página está ordenada por dateAdded descendente, (b) qué estados incluye (abiertos vs liquidados), (c) si dateAdded es fecha de publicación o de evento.
3. Solo si (a)-(c) se verifican: max(dateAdded) de la primera página = última publicación, y la pasada completa (209 lecturas, 35-55 min) tendría semántica defendible. Si la página no ordena por publicación, haría falta paginar y el coste cambia — se reportaría antes de seguir.
