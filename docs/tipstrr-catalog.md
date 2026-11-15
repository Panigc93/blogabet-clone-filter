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

## Actividad vs resultados (15-11-2026)

Criterio de diseño: separar dos cosas que el ranking por defecto mezcla —
filtrar por ACTIVIDAD (último pick publicado, p. ej. activos el último
mes) y ordenar por RESULTADOS (yield histórico). Evidencia de las
capturas existentes:

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
los umbrales se deciden en la UI.

1. **Pasada acotada de fútbol primero**, con alcance exacto ANTES de
   ejecutar: páginas 1-8 del endpoint observado (techo 10 peticiones,
   incluyendo 1-2 de validación del filtro de tipo y el hueco tips=0),
   guardando arrays de slugs completos (así el conteo y la deduplicación
   quedan medidos, no asumidos) + métricas de tarjeta (ROI, profit,
   win rate, cuota media, tips/semana, precio, "since").
   Ritmo: cualquier extracción recurrente requiere consentimiento explícito
   del propietario, con el riesgo de marcado/bloqueo de la cuenta por
   frecuencia explicado antes de ejecutar.
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

Parámetros de la pasada: orden **ROI** (`order=2`), período **3 meses** (`period=3`), free (`portfolioType=1`) y premium (`portfolioType=2`) por separado, hasta **3 páginas** por tipo y deporte, los 19 deportes del menú. Parada por rama: página vacía o parcial. Ritmo: 15-23 s (tramo 1) y 10-16 s (tramo 2). Condición de parada global (401/403/429/reto): **no se activó** — 0 respuestas no-200 en toda la pasada.

- Peticiones: 29 (leg1) + 34 (leg2) + 2 (MMA) = **65** (44 listing + 21 pageLoad), más 0-1 del intento descartado jsjob-1 (respuesta perdida con recarga).
- Resultado: **209 slugs únicos** (86 free + 123 premium, solape free∩premium = 0; 11 tipsters aparecen en más de un deporte).
- Combinaciones con resultados: 16 de 38; 22 vacías (0 tipsters con ≥45 tips bajo este filtro: cricket, darts, e-sports, greyhounds, handball, rugby-league, rugby-union, snooker, volleyball, golf free, MMA ambos, boxing ambos).
- Topes de 3 páginas alcanzados (cobertura truncada por ese tope): football free y premium, horse-racing premium.
- MMA: el slug del listado del pie (`/mixed-martial-arts`) es un soft-404 (HTTP 200, título "Error | 404"); el real es `/mma` (sportId 11). Ambos tipos vacíos.
- Captura: `captures/2026-11-15-catalog-selection.json` (38 combinaciones con arrays de slugs por página y timestamp por petición). Validación: las 38 combinaciones pasan `validateCatalogCapture` sin issues.
- `tips=45` (mínimo oculto por defecto del sitio) se mantuvo tal cual: los vacíos significan "0 bajo este filtro", no "0 tipsters del deporte".

## Fase de stats por perfil (2026-11-15 15:27-16:00 UTC)

217 peticiones totales (208 del job a 10-16 s + 7 pre-job por fallo de regex de extracción + 2 de sondeo de parámetro `?period=`, ignorado por la página). Cero no-200 en el job. 209/209 perfiles capturados (208 + TLE reutilizado de 13:46 UTC). Auditoría de las capturas: sin emails, tokens ni datos de sesión/PII.

### Hallazgo: el overview de /stats NO es all-time por defecto

`overview.period` varía por perfil: 3 (70 perfiles), 4 (60), 5 (26), 6 (53). Verificado contra las 209 capturas: los periodos 3/4/5 NO son reproducibles desde buckets mensuales (ninguna de las ventanas de meses naturales ensayadas cuadra de forma general — últimos N cerrados por calendario, últimos N presentes en la serie, ni incluyendo el mes en curso). Esto descarta esas comparaciones; la semántica real (rodante de N días u otra) queda SIN VERIFICAR. El código 6 sí es all-time: 50 de 53 cierran al tip contra la suma de la serie mensual. El parámetro `?period=` de la URL es ignorado (sonda en vivo, 2 peticiones).

### Puerta estricta (to-db.ts) — estado final 2026-11-15 17:40 CET

El histórico solo se persiste con CIERRE ALL-TIME INDEPENDIENTE verificable y base aconsejada confirmada; lo que dependa de completitud inferida de la serie va a cuarentena (no se persiste; captura y motivo conservados). Nada de esto fabrica datos: es criterio de calidad.

- PERSISTE: overview all-time (period 6, o ventana rodante con tips == Σtips Y periodStartDate <= fecha de alta EXACTA, sin tolerancia) Y tres cierres numéricos contra la serie: tips == Σtips, roi aconsejado == Σprofit/Σstaked (±0.05), profit aconsejado == Σprofit (±0.01). Los huecos de meses sin actividad NO excluyen: el cierre independiente confirma el total (verificado: 20 de 43 cierres period=6 tienen huecos y cierran). picks = overview.tips, yield = roi del overview (base ACONSEJADA: Σprofit/Σstaked cierra contra overview.roi en 41 perfiles y contra levelStakeROI en 0; 150/208 con Σstaked ≠ Σtips descartan base level). La batería de consistencia NO se exige: advised != level es estructural en stake variable, no contradicción.
- CERO REAL: overview all-time con tips = 0 y serie vacía → picks 0, yield null.
- CUARENTENA (clases separadas, sin amalgamar): [contradiccion-numerica] overview all-time sin cierre tips/roi/profit; [cobertura-sin-cierre] overview no all-time (el total sería suma de serie de completitud inferida); [total-ausente] overview sin total de picks; [ventana-posterior-alta] ventana rodante con tips == Σtips pero periodStartDate posterior al alta (o ausente): la igualdad no es cierre independiente del histórico.
- Métricas de periodo (yield3m/6m/12m, picks6mAvg): ventanas exactas de periods.ts, separadas del all-time; ventana incompleta = null.
- Upsert preserva-ausentes: mergeTipstrrUpdate (ausente en captura nueva nunca pisa valor válido guardado; id/platform/slug inmutables; marcas de tiempo avanzan), cableado en la ruta aislada del seed con regresiones en tests/crawler/tipstrr-to-db.test.ts.

### Resultado de la ingesta aislada con puerta estricta (PGlite, nunca Neon)

98 persistidos de 209 (todos con yield aconsejado) en la base AISLADA con ids PROVISIONALES -900000-i (salvo TLE -221629 real): FIXTURES de validación, NO payload importable — el estado /stats no expone portfolioId y la convención exige PK = -portfolioId real. 111 en cuarentena: 100 cobertura-sin-cierre + 9 contradiccion-numerica (joydi, nieder, on-target-tips, on-the-money-tips, parabola-bets, shrewd-tips, svb-tips, thebanker, trust-me) + 2 ventana-posterior-alta (revenue-faq: ventana 2026-05-08 con alta 2025-06-06; the-acca-blueprint: ventana 2026-08-15 con alta 2026-08-14). Capturas y motivos conservados; nada se borra. Composición de los 98: 43 con period=6 y cierres (conteo verificado sobre las 208 capturas) + TLE (44) + 54 all-time por igualdad con ventana desde el alta exacta y los 3 cierres. Re-seed idempotente: la segunda ejecución ejercita la ruta upsert sin error y conserva los valores.

Relación con conteos anteriores: el nivel antiguo "VERIFICADO 49" exigía además la batería completa en verde: eran 44 period=6 (incl. TLE) + 5 all-time por igualdad con batería verde. El conteo de cierres period=6 sobre el directorio de 208 (sin TLE) es 43: la diferencia de 6 es TLE + esos 5 perfiles por igualdad. La puerta estricta NO exige la batería, por eso persiste 98 y no 49: los 54 all-time por igualdad tienen ventana desde el alta exacta y los tres cierres numéricos independientes.

Controles aplicados: (1) igualdad exacta tips serie vs overview cuando el overview es all-time; (2) cierre roi = Σprofit/Σstaked ±0.05 y profit ±0.01; (3) meses sin actividad no generan fila y los huecos intermedios no corrompen la suma — sí anulan ventanas de periodo vía periods.ts (complete=false); (4) ausente es null, nunca 0.

### Huecos conocidos

- Precio de suscripción: NO está en el estado /stats (membershipTier null incluso en premium); solo en tarjetas del listado, no capturadas.
- Actividad último pick: dateAdded por tip solo en el detalle /tipster/<slug>/results (PORTFOLIO_TIP_CACHED). Opción preparada NO ejecutada: 1 lectura por perfil (~209, 35-55 min a 10-16 s); la ordenación "última publicación" NO está probada — verificar dateAdded descendente en primera página antes de usar max(dateAdded) como lastPickAt.
- Los 9 rechazados son perfiles cuya primera fila mensual cae 1 mes después del alta (probable primera actividad tardía, no truncamiento, pero ambiguo); recuperables con una fuente de total independiente.

### Actividad (último pick) — comprobación acotada PREVIA a cualquier pasada (NO ejecutada)

Antes de proponer 209 lecturas, resolver la semántica con 2-3 lecturas acotadas:
1. Elegir 2 perfiles del catálogo: uno con activeTips > 0 y otro con activeTips = 0 (ambos datos ya en las capturas /stats).
2. Leer /tipster/<slug>/results de cada uno (mismo ritmo 10-16 s) y extraer PORTFOLIO_TIP_CACHED: comprobar (a) que la primera página está ordenada por dateAdded descendente, (b) qué estados incluye (abiertos vs liquidados), (c) si dateAdded es fecha de publicación o de evento.
3. Solo si (a)-(c) se verifican: max(dateAdded) de la primera página = última publicación, y la pasada completa (209 lecturas, 35-55 min) tendría semántica defendible. Si la página no ordena por publicación, haría falta paginar y el coste cambia — se reportaría antes de seguir.

### Estado de validación — 2026-11-15 17:40 CET

- Base del yield CONFIRMADA como aconsejada: Σprofit/Σstaked cierra contra overview.roi (advised) en 41 perfiles, contra levelStakeROI en 0, contra ambos en 64 (stake plano, indistinguible) y contra ninguno en 104 (ventanas no all-time, esperado). El yield persistido es roi del overview (base aconsejada) solo cuando los tres cierres numéricos pasan.
- Completitud de la serie NO se asume: 67 perfiles tienen 862 meses ausentes en total; 0 filas con tips=0 no prueba omisión de meses inactivos. Por eso la puerta estricta cuarentena todo total que dependa de la suma de la serie sin cierre all-time independiente (100 perfiles en [cobertura-sin-cierre]).
- 150/208 perfiles con Σstaked ≠ Σtips: la descripción global "level stake" queda descartada; advised != level es estructural en stake variable y NO es clase de cuarentena.
- Upsert preserva-ausentes: IMPLEMENTADO (mergeTipstrrUpdate), cableado en la ruta aislada del seed y con regresiones en tests/crawler/tipstrr-to-db.test.ts.
- 142 pendientes con yield de la clasificación anterior: NINGUNO persiste con la puerta estricta; quedan en cuarentena con clase y captura conservada.
- tsc limpio, 175/175 tests y `next build` compila desde checkout limpio; el aviso final de "patch lockfile" es del entorno de verificación (node_modules enlazado), no del código.

### Guardas de import (implementadas 2026-11-15 17:52 CET, endurecidas 18:00 CET, con regresiones)

1. Rechazo de fixtures ANTES de escribir: assertRealImportProvenance lanza si idSource es 'isolated-fixture'; acepta 'source-captured' (id del origen) o 'internal-transactional' (surrogate generado por la propia ruta real en su transacción — alinea el contrato con la clave natural, ver sección de identidad). ESTADO: sin callers reales (solo tests); NO es efectiva antes del write hasta que la única ruta de import real la invoque; el seed aislado no la llama (su entorno es el fixture).
2. Frescura estricta y conservadora: planTipstrrUpsert devuelve skip si la captura no es más reciente que la fila guardada (capturedAt nuevo <= almacenado, igualdad incluida). Política explícita ante fechas dudosas: captura nueva SIN capturedAt parseable (ausente o inválida — un NaN no puede ganar la comparación) → skip; fila existente SIN capturedAt → skip (no se puede ordenar, no se sobrescribe). Regresiones: igual/ausente/inválida/existente-sin-fecha.
3. Cuarentena vs frescura: planTipstrrUpsert devuelve skip para todo mapeo rechazado: una cuarentena NUNCA escribe, y la fila existente conserva valores y marcas — un yield viejo no puede parecer fresco por un capturedAt nuevo. El motivo de la última validación fallida se registra FUERA de la fila (ver siguiente sección), para que un yield antiguo no aparente estar re-confirmado.
4. mergeTipstrrUpdate queda como pieza interna del plan (ausente nunca pisa válido; identidad inmutable), no para uso directo.

### Registro de validaciones fallidas (diseño; artefacto aislado ya implementado)

Una cuarentena no toca la fila, así que el consumidor no puede saber si la última captura validó o falló. Diseño: registro del motivo de la última validación fallida FUERA de la fila — en el entorno aislado, el seed escribe crawler/platforms/tipstrr/captures/2026-11-15-quarantine-log.json (slug, clase, motivo); para la ruta real, tabla import_validation_log (platform, slug, captured_at, clase, motivo) escrita en la misma transacción del plan. Es un registro de revisión, no oculta datos al consumidor.

### Identidad por clave natural (recomendación de arquitectura, borrador 0005 NO ejecutado)

(platform, slug) es la clave de negocio operativa — ux_tipsters_platform_slug la impone desde 0004 — y el id numérico pasa a surrogate interno transaccional (secuencia tipsters_internal_id_seq en espacio negativo separado), no un índice del directorio Tipstrr. Motivo: /stats no expone portfolioId; exigir PK=-portfolioId obligaría a ~208 lecturas /results solo por un número. Limitación declarada: el slug es la URL canónica hoy, pero una plataforma puede renombrar slugs — la clave es operativa, no una garantía universal de estabilidad; source_portfolio_id queda como provenance opcional si una lectura futura lo expone. Borrador en drizzle/0005_tipstrr_internal_pk.sql, no aplicado a ninguna base.

### Métrica de actividad (política, sin última publicación exacta inventada)

El filtro "activos el último mes" NO se cierra con un timestamp exacto de publicación: (a) la serie mensual solo da el MES con picks (granularidad mensual), (b) activeTips cuenta tips abiertos, que pueden haberse publicado hace más de 30 días, (c) dateAdded por tip existe en /results pero la primera página ordena por fecha de EVENTO (observación de muestra, no contrato), así que max() de página 1 no certifica la última publicación global, y (d) el render puede venir cacheado horas (SERVER_DATE 14:39Z en lectura 16:48Z). Política: dos métricas separadas y honestas — "último mes con picks observado" (de la serie /stats, con fecha de captura) y "tips abiertos ahora" (activeTips) — declarando que el negativo es "sin actividad observada", no "inactivo probado". lastPickAt exacto queda null; nunca se fabrica desde el bucket mensual.

### Sonda selector all-time de /stats (EJECUTADA 2026-11-15 ~16:53-16:56 UTC sobre perfil 1086, cobertura-sin-cierre)

Resultado: la vía nativa EXISTE, con matices. El selector nativo <select id="portfolio-stats-period"> con value 6 (All time) dispara los fetches cliente de la propia UI; el script de hidratación NO se muta (sigue period 3) — el estado actualizado vive en las respuestas API, no en el HTML. Contabilizado: 1 navegación + ráfaga derivada (50 recursos nuevos; 11 llamadas /stats/{month,sport,bet-type,bookmaker,hour,time-before,odds-total,stake,league}/6 + month-overview/ + /api/portfolio/<slug>) + 3 GET de verificación en rutas observadas (espaciados 11-12 s). Hallazgos:

1. /api/portfolio/<slug>/stats/sport/6 devuelve los TOTALES ADVISED ALL-TIME (tips 563, staked 457.5, profit −33.6674, roi −7.36 para 1086; con variantes level/bsp; suma de filas si multi-deporte). CIERRE 3/3 VERDE contra la serie capturada: tips 563==Σ563, profit −33.6674≈Σ−33.667 (diff 0.0004), roi −7.36≈Σprofit/Σstaked (diff 0.001).
2. /stats/month/6 devuelve la serie mensual ADVISED IDÉNTICA a la capturada embebida esa misma mañana (sin re-scope ni obsolescencia).
3. El overview de /api/portfolio/<slug> sigue period 3 tras la selección: los totales advised all-time salen de sport/6, no del overview.
4. La página MUESTRA por defecto cifras level-stake (toggle): el texto del DOM no es la base advised — leer campos, no € renderizados.
5. month-overview difiere de month/6 en el mes en curso (5.8081 vs 6.3081, 0.5u): ciclos de actualización distintos ("stats updated every 24 hours").

Consecuencia: para los 111 cuarentenados hay una ruta de cierre — GET /api/portfolio/<slug>/stats/sport/6 (ruta pública observada llamada por la propia UI; NO adivinada) — a ~1 petición por perfil. DECISIÓN PENDIENTE (semántica de la puerta, no auto-aplicada): si la puerta estricta acepta sport/6 como cierre all-time independiente, y si la pasada de ~111 perfiles se autoriza (red, ~20-30 min a 10-16 s). Captura: crawler/platforms/tipstrr/captures/2026-11-15-alltime-selector-probe-1086.json. Sonda PAUSADA por nueva prioridad de despliegue (17:57): respuesta conservada, red no expandida.

### Preview seguro (requisitos ANTES de configurar nada)

Desplegar la rama en Preview requiere primero una propuesta que Juan apruebe con: qué cuenta/servicio se usa (Vercel existente o nueva), qué base de preview (rama Neon gratuita vs otra), coste esperado (idealmente 0 €, declarado), qué variables de entorno hacen falta y qué datos se siembran (los 98 verificados, nunca fixtures como si fueran reales). Sin esa aprobación explícita no se configura nada: no hay autorización implícita de cuentas ni gasto.
