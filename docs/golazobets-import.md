# Golazobets — paquete de revisión del importador

Rama: `feature/multi-platform-sources`. Componentes:
`crawler/platforms/golazobets/to-db.ts` (puerta + mapeo, puro),
`scripts/import-golazobets-catalog.ts` (orquestador, dry-run por defecto),
`tests/crawler/golazobets-to-db.test.ts` (16 tests),
capturas `crawler/platforms/golazobets/captures/2026-11-15-catalog.json` y
`2026-11-15-profiles/<slug>.json` (284).

**Estado de autoridad**: producción Golazobets NO autorizada. `--apply` no
debe ejecutarse hasta autorización expresa de alcance y esta revisión.

## Fuente y semántica (medida 2026-11-15, acceso público sin sesión)

- Listado `/tipsters?page=N` (28 páginas, 36/página, paginador Laravel
  declara total=1001). 850 slugs únicos (119 slugs con 151 entradas
  repetidas entre páginas, cero conflictos entre observaciones).
- 284 con estadísticas en listado (coincide con el contador "284" de
  portada; semántica del contador no probada, compatibilidad medida).
  566 sin estadísticas: ausente=null, laguna declarada (muestra acotada de
  3 perfiles vacíos; no verificación exhaustiva).
- Perfil `/tipster/<username>`: `tipster_stats` (cabecera all-time) +
  `stats` (filas mensuales all-time) + `picks` paginado + `recent_results`.
- Unidades: profit/total_bet en UNIDADES de stake; yield = 100·profit/total_bet.
  Verificación ancla: KROM90 Σmensual = cabecera exacta (140 picks, 55,63,
  42,14 %). `picks.total` incluye abiertos (143 vs 140 cerrados en KROM90):
  la cabecera `number_bets` cuenta cerrados.

## Puerta (`golazobetsClosureGate`)

1. `type` ∈ {free, premium}; otro valor → cuarentena[tipo-desconocido].
2. Cabecera completa (number_bets, total_bet, profit, yield no null);
   si no → cuarentena[stats-ausentes].
3. Serie mensual presente y sin nulls; si no →
   cuarentena[datos-mensuales-ausentes].
4. picks: Σ mensual === cabecera (EXACTO); si no → cuarentena[cierre-picks].
5. profit: |Σ − cabecera| < 0,005·n_meses + 0,01 → si no,
   cuarentena[cierre-profit].
6. Σ total_bet > 0; si no → cuarentena[volumen-cero].
7. yield derivado: |100·Σprofit/Σbet − cabecera| <
   0,06 + 100·tol_profit/Σbet → si no, cuarentena[cierre-yield].

## Derivación de cotas (bajo supuesto, no causalidad probada)

La plataforma redondea cada fila mensual a 2 decimales; la cabecera parece
agregar sin redondeo intermedio. Bajo ese supuesto, el error acumulado de Σ
profit respecto a la cabecera está acotado por 0,005·n_meses (más 0,01 de
margen). El error de yield se escala con 100/Σbet: perfiles con poco volumen
amplifican el redondeo de profit en puntos porcentuales, por eso la cota de
yield es volumen-dependiente. Es una COTA MATEMÁTICA bajo el supuesto de
importes redondeados: no prueba que toda diferencia dentro de cota sea
redondeo. Los valores fuente se conservan tal cual en las capturas.

Candidatos límite medidos (dentro de cota, CONSERVADOS bajo revisión, no
resueltos): Alexf1Bets (Δprofit +0,02, 907 picks exactos), Barbosa97
(+0,02), FutbolEnCasa (Δyield +0,07pp), GOLAZOBETS (Δyield +0,09pp).
Decisión pendiente de la revisión independiente: admitir yield derivado con
cota escalada, o puerta solo sobre picks+profit con yield recalculado en
importación.

## Resultado medido de la puerta sobre las 284 capturas

284/284 dentro de cota (picks exactos en 284/284). 0 cuarentenas en este
lote. Los 566 sin stats no son importables (ausente=null): irían a
cuarentena[stats-ausentes] si se intentara.

## Garantías del orquestador

Solo-altas, insert+log atómicos, ids por `tipsters_internal_id_seq`,
buildInsert compartido con el pipeline Tipstrr (probado con PGlite),
postchecks: recuento antes+inserts=después, huella md5 de preexistentes
invariante, fixtures=0. Dry-run por defecto.

## Puntos de la revisión independiente (2026-11-16) y su resolución

- **Filas (year,month) duplicadas**: 86/284 capturas tienen meses repetidos;
  las sumas incluyendo ambas filas cierran exactas en los 86. Motivo de la
  doble fila desconocido: se conserva el raw tal cual, sin deduplicar; la
  agregación (suma) es la que cierra y es la única que se usa en la puerta.
  La fila importada guarda cabecera, no la serie, así que no se colapsa nada.
- **picks_total > number_bets en 103 perfiles**: se importa `number_bets`
  (cerrados); picks_total incluye abiertos (semántica compatible, causa no
  afirmada). `picks_total` no se importa.
- **Unidades**: `profit_unit = 'golazobets-units'` (etiqueta propia): no
  equivalentes a 'units' Tipstrr ni 'eur' Blogabet; evita comparación
  silenciosa en ordenaciones por profit. Pendiente en UI: cualquier ranking
  cruzado por profit debe excluir o etiquetar esta unidad.
- **Yield**: se importa el yield FUENTE de cabecera (sustituirlo por el
  derivado cambiaría fichas hasta ~0,25pp); el derivado solo se usa en puerta.
- **Cotas**: compatibles con redondeo, sin causalidad probada; Σbet bajo da
  poca potencia discriminante a la puerta de yield (documentado arriba).
- **Fechas**: signup/completitud solo con fuente — no capturada → null;
  last_pick_at null (granularidad mensual no es fecha de pick); price null
  (precio premium no expuesto en lo capturado).
- **Premium**: 5 en catálogo único; 4 capturados con stats (Apuestas Tx,
  BliZPickS, Hristov8, TRIBET Apuestas); 1 ('pruebas') sin stats → no
  importable (cuarentena[stats-ausentes] si se intentara).
- **Privacidad**: 15 slugs del catálogo con formato email redactados a id
  opaco sha256 en el artefacto (no estaban entre los 284 capturados). Las
  capturas de perfil no contienen campos personales (solo stats de tipster).
  Valores originales presentes en historia git anterior a este commit
  (artefacto f36a3ac): repo privado; decisión de reescribir historia
  pendiente, no tomada unilateralmente.
- **MYS y win/loss**: no se usan como filtro de importación; nadie se
  descarta por pérdidas.

## Cobertura y lagunas declaradas

Cobertura = unión medida: 850 slugs únicos catalogados, 284 con históricos.
Lagunas: 566 sin stats no verificados a nivel perfil; contador de portada
(284) no probado como definición; paginación inestable (repeticiones).
