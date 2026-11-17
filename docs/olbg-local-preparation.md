# OLBG: descubrimiento y adaptador local

Corte: 17 noviembre 2026. Base aislada: master `1558627`.

## Estado real

- 60 listados públicos capturados: 20 tablas All Tips en vistas actual, seis y doce meses.
- 5.911 filas recibidas; 867 identificadores numéricos únicos. Son perfiles descubiertos, NO 867 perfiles descargados o publicados.
- Tres perfiles piloto: ewanvrs (565069), ToofanExpress (342919), Fjori (535122). Cada uno tiene captura mensual global y tablas de seis/doce meses.
- Lector y preparación offline, tests con proyecciones reales, componente visual aislado. No hay ruta nueva, selector, importador SQL, migración ni cambio en la UI existente.
- No producción, push, PR, cuentas nuevas, gasto ni despliegue. No se mezclan ramas B2I/Bettingexpert.

## Descubrimiento sin recorrer IDs al azar

El sitio enlaza perfiles por ID numérico y publica los participantes en sus tablas de competición. La unión se deduplica por ID, conservando cada aparición y nombre observado.

Fuentes observadas:

- https://www.olbg.com/best-tipsters : escaparate restringido a rentables con tips abiertos.
- https://www.olbg.com/tipsters/tables : tablas de competición, incluidas pérdidas.
- https://www.olbg.com/tipsters/tables?id=t-136&o=0&v=1 : All Tips de caballos actual, seleccionado mediante la UI.
- https://www.olbg.com/tipsters/tables?id=t-136&o=120&v=12 : vista doce meses, verificada en navegador.
- Datos públicos del mismo componente: `https://www.olbg.com/tipsters/tables/data` con los parámetros del selector.

La pasada usa las 20 tablas enumeradas por el propio sitio. Se efectuó sin sesión, con al menos diez segundos de pausa tras cada consulta de la pasada y parada configurada para 401/403/429. No hubo esas respuestas.

Límites oficiales observados: top100 por tabla/vista, mínimos10tips para6m/20para12m, exclusión de quien no accedió al sitio en90d. El contador de participantes puede ser mayor que las filas entregadas. Hay filas con cero tips actuales aunque el texto de la tabla diga un mínimo de uno: conservar la discrepancia, no declarar actividad. Esta unión no es catálogo completo. La primera pasada actual dio580IDs; las vistas6/12 llevaron la unión a867.

## Semántica que no puede mezclarse

- `LSP` = beneficio a stake fijo de una unidad (o0,5EW), según el texto oficial de criterios de competición.
- `profit` es otra serie de beneficio de competición. No se convierte a euros ni a LSP mediante un factor supuesto.
- El escaparate anuncia beneficio a diez puntos; no se mezcla con las dos series anteriores.
- ROI se conserva tal como lo publica OLBG. No se sustituye por LSP/tips. En datos reales hay diferencias superiores al redondeo.
- Las tablas de comments, NAP, Irish Racing y All Tips se solapan. No se suman todas.
- Las tablas All Tips por deporte se muestran por separado. No se presenta ninguna como un total global.
- Los meses globales All Tips se conservan literalmente. Se pueden sumar picks/LSP de ventanas completas, pero no se promedian sus ROI redondeados. Un mes ausente no prueba cero apuestas.
- El mes actual se marca y queda excluido de ventanas cerradas. La referencia de mes procede del `monthYear` del directorio contemporáneo y se contrasta con la etiqueta del perfil; no se inventa la zona de calendario de OLBG.
- `lastAccess` no es última apuesta. No se infiere actividad, followers, verificación o historial completo de los datos piloto.

Fuentes de contraste:

- https://www.olbg.com/tipsters/performance/month/565069
- https://www.olbg.com/tipsters/performance/table/565069?p=2
- https://www.olbg.com/tipsters/about/565069
- https://www.olbg.com/best-tipsters/Horse_Racing/2/565069
- https://www.olbg.com/best-tipsters/Baseball/12
- https://www.olbg.com/use (términos consultados, no resolución jurídica ni autorización).

## Archivos

- `crawler/platforms/olbg/reader.ts`: parser puro, referencias Svelte sin eval; identidad, URL, ámbito, periodo y cifras validados.
- `crawler/platforms/olbg/prepare.ts`: preparación explícitamente no lista para DB, sin yield global ni all-time inventados.
- `scripts/prepare-olbg-local.ts`: lee capturas privadas existentes y genera plan JSON local. Ningún acceso de red/DB.
- `tests/fixtures/olbg/`: diez PROYECCIONES estadísticas de respuestas reales. No son respuestas completas. Se excluyen campos incidentales de cuenta, premios, moderación, tracking y propietario del avatar.
- `components/olbg/OlbgStats.tsx`: prototipo no aprobado para integrarse. No está importado en rutas existentes. Se conserva solo para revisar el ámbito de las cifras.
- `scripts/preview-olbg.tsx`: genera HTML local usando esas proyecciones. No publica nada.

Las capturas completas y el inventario de867IDs quedan FUERA del repositorio público. La transferencia privada incluye hashes de los archivos retenidos. Los hashes originales de respuesta HTTP fueron calculados al descargar, pero no se guardaron los bytes originales completos de respuesta: solo el sobre estructurado extraído. Por ello NO se declara reproducción byte-a-byte ni verificación posterior del hash HTTP original. El `storedSha256` del inventario verifica el archivo estructurado conservado. No confundir ambos.

## Verificación

- 281 tests de30archivos pasaron, incluidos21nuevos específicosOLBG.
- `npx tsc --noEmit` pasó.
- `NEXT_IGNORE_INCORRECT_LOCKFILE=1 npm run build` pasó. La ejecución normal llegó a compilar pero el reparador automático del lockfile SWC falló intentando parchear dependencias preexistentes y agotó el turno; no se cambiaron lockfile ni versiones.
- Render local con React y componente real, inspeccionado a1280y390px. No desbordamiento horizontal en390. Positivos, negativos y desconocidos diferenciados. No es una captura de producción ni diseño aprobado.

## Lo que queda para incorporar OLBG

El escalar actual de `tipsters` asume un conjunto global de métricas. No cabe mapear una tabla deportiva a ese escalar como si fuera historial total. Esta preparación no oculta ese problema con nulls ambiguos ni altera la consulta compartida.

Siguiente decisión técnica: soportar ámbito explícito de estadística en la presentación existente, manteniendo ranking global sin dato cuando no exista agregado verificable, o conseguir total apostado/ROI global exacto de una fuente pública adicional. Antes de publicar: revisión independiente del lector, modelo de ámbito, persistencia privada con procedencia real por captura y tests SQL/API/mapper con las otras plataformas.

Posibles ampliaciones de descubrimiento: órdenes públicos alternativos y meses anteriores, de forma acotada y deduplicada. No se han recorrido todavía ni justifican anunciar exhaustividad. No se ha iniciado la descarga masiva de867perfiles.
