# Apuestes.com — preparación local (rama apuestes-local-prep)

Investigación 2026-11-19. Solo local: sin escrituras en DB remota, push, deploy
ni producción. Capturas con ≥10 s entre peticiones, User-Agent de navegador,
sin bypass de ningún tipo. Gainblers quedó descartado por Juan el 2026-11-19.

## Fuentes verificadas en vivo

- `GET /tipsters` — HTML Vue con 12 tipsters Gold (type 33) embebidos.
- `GET /api/tipsters/free` — JSON público sin auth con 7.640 tipsters
  (identidad, picks, yield, beneficio, winrate, cuota/stake medios, planes).
- `GET /tipster/<username>` — un GET por perfil con TODO server-rendered en
  bloques `JSON.parse('...')`: histórico + 3m + 6m + 12m (picks, yield,
  beneficio, winrate, stake y cuota medias), seguidores, planes de precio y
  historial mensual (`stats.months[].fecha_pub2` = última actividad).
- `GET /api/tipster/<id>/stats` — JSON global (paridad con lo embebido).

## Universo (2026-11-19)

7.652 perfiles: 7.640 lista free + 12 Gold. Solo 290 activos (publican ahora);
3.716 con picks >0; 1.047 con ≥50 picks; 708 con ≥100; 183 con ≥500.
De los activos: 266 gratuitos y 16 de pago (planes o precio por pick).
En la lista "free" hay 102 con planes de pago y 375 con precio por pick:
la lista NO clasifica; Free/Pago se decide solo desde el perfil
(`isPaidProfile` en types.ts). Nada de unknown→gratis.

## Unidades y NULL

- Beneficio y stake en UNIDADES (stake medio ~1), nunca euros; el € del sitio
  es el precio de suscripción. profitUnit propuesto: 'apuestes-units'.
- Ventana sin picks → totalPicks=0 y yield null (PuntoAR, galopeapuestas).
  Mapeo directo a NULL de esquema; 0 nunca significa "sin dato".

## Muestra validada (11 perfiles, data/apuestes/sample-11.json)

Prueba Node del parser contra HTML real: 88/88 checks (identidad, histórico,
3m, 6m, 12m, NULL en ventanas vacías, Free/Pago). Paridad exacta listado vs
perfil salvo crecimiento en vivo (Tradingchevaux 11.012→11.020 picks).

## Calidad de dato

- Yields altos reales con cuotas medias altas (galopeapuestas 55% con cuota
  media 24,5, caballos): conviene filtros por picks mínimos, no recortes.
- El flag `active` del listado no existe en el perfil; la última actividad se
  deriva de `stats.months`.

## Coste y plan de captura propuesto (pendiente OK de Juan)

- ~10 s por perfil. 290 activos ≈ 50 min; 1.047 con ≥50 picks ≈ 3 h;
  3.716 con picks ≈ 10,5 h. Dos GET baratos ya dan el catálogo global.
- Propuesta por defecto (patrón BE 547): activos + con actividad 12m, después
  ampliar. Decisión de alcance: de Juan.

## Evidencia de campos (2026-11-19, sin renombrar por inferencia)

- Perfil: `generalStats{,.totalProfit,.yield,.stakeAvg,.oddsAvg}` y lo mismo en
  los bloques `...LastTreeMonth/...LastSixMonth/...LastOneYear`. El sitio los
  muestra como "Beneficio" sin símbolo de moneda; el € solo aparece en los
  botones de suscripción ("Contratar 43 €").
- API de picks `/api/tipster/<id>/historico` (20 filas de muestra, Ocpicks):
  campos crudos `stake`, `profit`, `yield`, `eurosunidad` (=0 en las 20),
  `cuotaes`, `cuotacom`, `bookiees_id`, `bookiecom_id`. Se conservan tal cual
  en bruto; ninguno se reinterpreta como euros.
- profitUnit propuesto: 'apuestes-units' (stake medio ~1 en los 11 perfiles de
  muestra). La definición exacta de `eurosunidad` queda sin verificar: está a 0
  en toda la muestra y no se usa.
- Ventanas 3/6/12m: móviles desde la fecha de consulta, no meses naturales
  (verificado 2026-11-19 con kris, Ocpicks, Tradingchevaux y Avatarr contra su
  historial mensual: cada valor cae dentro del rango [meses completos, +mes
  frontera]).
- Conciliación activos: 290 = 266 gratis + 24 de pago (8 cobran por pick
  suelto con planes a 0 €; la clasificación exige mirar pickPrice Y planes).

## Integración local con la app (2026-11-20)

- `crawler/platforms/apuestes/to-db.ts`: mapping real fila → insert tipsters (puro, gated). Holds a nivel fila: discrepancia totalPicks (27), meses incompletos (2), yield fuera de numeric(6,2) (1: NHLPICK 55379, yield_3m -11100 real). Importables: 3.659.
- Privacidad: 7 usernames email enmascarados (nombre `abc***`, slug desde el nombre enmascarado, nunca la dirección). 3 handles con '@' NO email se muestran tal cual (son públicos, no direcciones). Tests: `tests/crawler/apuestes-to-db.test.ts` (12/12), incluye barrido de las 3.716 filas (slugs únicos, sin '@', sin direcciones).
- UI existente (sin UI nueva): opción Apuestes en el filtro de plataforma, adaptador de tarjeta (profit en 'u', yields de ventana, '—' en no expuestos), etiqueta "Apuestes · captura <fecha> (no es sincronización)", botón VER EN APUSTES.
- Seed aislado PGlite (`scripts/seed-apuestes-local.ts`): 3.659 filas reales + 57 holds en import_validation_log. App servida con USE_PGLITE=1: home renderiza 50/3.659 con filtro Apuestes (verificado en captura de pantalla).
- Limitación documentada: la URL del perfil se construye desde el nombre mostrado; 761 nombres con caracteres no URL-safe pueden no resolver hasta decidir almacenamiento de source_url (cambio de esquema = alcance remoto).

## Integración v2 (2026-11-20, tras revisión de main)

- Tarjetas SIN texto de captura/sincronización (Juan no quiere añadidos UI): capturedAt=null en el modelo de tarjeta; la trazabilidad queda privada en columnas DB (captured_at, stats_updated_at, source_portfolio_id, source_url).
- URL exacta resuelta desde evidencia existente: listado /tmp/apuestes-free.json tiene urlProfile para los 7.640 (0 ausentes), incluye acentos codificados. Exportado a data/apuestes/profile-urls.json (privado). Migración local draft drizzle/0006_apuestes_source_url.sql (ADD COLUMN source_url text) + schema.ts; NO aplicada en remoto. Las 3.659 filas llevaban source_url exacta en v2; desde v3 los 7 usernames email NO la guardan (conSourceUrl=3652 en seed).
- Ruta de import idempotente: crawler/platforms/apuestes/import.ts (plan puro + executor). Upsert ON CONFLICT (platform, slug), merge preserva-ausentes via COALESCE(excluded, actual). Idempotencia demostrada: dos pasadas consecutivas, estado idéntico (rows=3659 sumPicks=385445). import_validation_log registra 57 holds por pasada (por diseño).
- Valores "sorprendentes" verificados contra crudo (sin corregir por intuición): mike95 1 pick +9u 300%, ViictorCL 1 pick +14,51u 290,2%, deleon500 1 pick +1,33u 266%: cifras exactas del sitio (hist y months reconcilian). Muestra pequeña, no error de mapping.
- Tests: 26/26 (mapping, privacidad, colisiones, merge preserva-ausentes, plan sobre captura real con 3659/57 y klasses exactos, card model existente).
- Hold de NHLPICK (yield -11100) se mantiene; NO hace falta ampliación de esquema (decisión de main).
- Precio omitido (semántica de planes no verificada); Free/Pago se muestra con respaldo del perfil ($ icon).

### Alcance remoto pendiente de aprobación (concreto)
1. Aplicar migración 0006 (source_url) en Neon.
2. Ejecutar la ruta de import contra Neon (3.659 filas + 57 holds).
3. Verificación en vivo de la semántica de planes ('10'/'12') para precio (requiere autorización de consulta).
4. Push de la rama y despliegue.

## Integración v3 (2026-11-20, riesgos del importador resueltos)

- PK global: ya NO se usa -id del origen (no garantizaba ausencia de colisiones con el espacio negativo de otras plataformas, p.ej. -portfolioId de Tipstrr). Se usa el mecanismo existente seguro: secuencia tipsters_internal_id_seq (0005, desde -2.000.000.000 descendente), asignada con nextval dentro de la transacción SOLO en filas nuevas; en conflicto el id existente jamás se toca. idSource 'internal-transactional' (mismo que Tipstrr). Sin asumir espacio negativo exclusivo.
- Ausencia vs vacío: el mapping nunca emite null por ausencia de dato (esa fila queda held); un null nuevo es un VACÍO VERDADERO (ventana con picks=0 explícito). El update SOBREESCRIBE todas las columnas gestionadas, nulls incluidos: una ventana poblada->vacía pone su yield a NULL en vez de conservar el antiguo. Sustituye al COALESCE general.
- Bug real detectado por la regresión: las claves del `set` de drizzle son nombres de propiedad camelCase; con claves snake_case la columna se ignoraba en silencio (profit actualizaba, yield_3m no). Afectaba también a la versión COALESCE v2. Corregido con pares [propiedad, columna] explícitos.
- Emails: los 7 usernames email NO guardan source_url (la URL exacta llevaría la dirección); nombre y slug ya iban enmascarados. Seed: conSourceUrl=3652 (=3659-7).
- Regresión real (scripts/apuestes-import-regression.ts, PGlite, 16/16 PASS): filas blogabet (id 12345) y tipstrr (id -221629) pre-sembradas intactas tras dos imports completos; ids apuestes todos <= -2.000.000.000, distintos, sin colisión con preexistentes; transición poblado->vacío (yield_3m 28.74 -> NULL), vacío->poblado (NULL -> 15.50), cambio real de profit aplicado, id/platform/slug inmutables; holds nunca en tipsters.
- Verificación app local tras v3: seed idempotente rows=3659 sumPicks=385445 conSourceUrl=3652.
- Tests: 26/26; tsc limpio.
