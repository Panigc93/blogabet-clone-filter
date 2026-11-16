# Actividad por evidencia de publicación

Estado: rama de revisión, NO desplegar sin aprobación. No requiere migración
ni escritura Neon. Los datos de evidencia se publicarán con la aplicación
solo si se aprueba el merge. No añade cron ni actualización automática.

## Qué significa

Una publicación observada en el intervalo demuestra actividad, aunque el
historial sea parcial. Una página sin publicaciones recientes NO demuestra
inactividad. El filtro "Último mes: sin confirmar" muestra el complemento:
puede incluir perfiles inactivos, sin capturar, parciales o con fechas
inciertas. Nunca etiqueta ese grupo como inactivo.

BB conserva exactamente su condición last_pick_at >= NOW menos N meses.
Ese campo es una aproximación: al encontrarlo en el catálogo BB de activos
del mes, el crawler guarda el momento de observación. No se reescribe ni
se convierte a publicación real. Las otras plataformas usan evidencia
separada y no rellenan last_pick_at artificialmente.

## Precisión y límites

Tipstrr: la única prueba cargada inicialmente es la publicación TLE del
13-nov-2026 07:05:04Z de la captura original del 15-nov. Su cache NO contiene
necesariamente las últimas publicaciones. No se toma su máximo como última
global. Nueva consulta /results devolvió 403 el 16-nov: STOP, sin reintento,
cambio de cliente ni rutas alternativas. Los otros perfiles sin prueba
reciente son desconocidos, no inactivos.

Golazobets: created_at es publicación, distinto de event_date/resolved_at.
Una primera página basta para prueba POSITIVA, no prueba negativa. Las
muestras ordenan por publicación, pero no hay contrato global demostrado.
La fecha no incluye offset: se usa intervalo conservador para todo el
rango civil UTC-12..UTC+14. Solo pasa el filtro cuando TODO el intervalo
está dentro de la ventana y en el pasado. Casos de frontera quedan sin
confirmar. No se inventa UTC ni zona Madrid. La fecha de captura no es la
fecha de publicación. max observado es una cota, no último global.

## Artefacto

Colector JSONL: slug, sourceUrl exacta observada, capturedAt ISO, observedPicks
[{created_at,...}], pagination, coverage. Se lee solo la lista permitida;
nunca se guarda HTML/props de usuarios/email. Preparación offline:

    npx tsx scripts/prepare-activity-evidence.ts captura.jsonl data/activity/evidence.json

El JSON de salida contiene platform/slug/sourceUrl/capturedAt, límites
publicación, precisión y cobertura. Se revisa antes de commit/despliegue.
Solo un dato válido por perfil; fechas ausentes no se rellenan. Esta rama
empieza con la prueba Tipstrr existente y espera la captura Golazobets
284 perfiles autorizada. No afirmar cobertura completa antes de integrarla.

El mismo buildFilters aplica SQL antes de count, orden y paginación tanto
en SSR como API. No se filtran arrays después de paginar. SQL parametrizado,
sin interpolar identificadores de usuario. La vista /lab/activity es visual,
sin DB ni resultados ficticios.

## Pruebas

Actividad: datos parciales, ausencia, intervalo zona desconocida, límite
de mes, timestamp futuro, identidad/plataforma, parser SSR/API compartido,
BB invariante, SQL 284 perfiles parametrizado y null-safe unknown.

El fallo basal de main() ejecutado al importar import-tipstrr-prod.ts se
reprodujo sobre master 0aac60c. Se corrige en commit separable con guard de
punto de entrada (import.meta.url), conservando ejecución CLI directa. Un
subproceso de prueba importa builders sin DATABASE_URL y con fetch que
lanza error si se llama: no hace red, DB ni process.exit. Suite 250/250 OK,
sin errores no capturados; TypeScript OK (antes de integración de lote).

Visual local: app real contra PGlite aislado, 284 filas Golazobets desde
capturas fechadas y dos filas Tipstrr desde snapshots reales. Tipstrr
activity=1 devuelve TLE, no StatMind; desconocido devuelve los perfiles sin
prueba. Esto NO prueba producción ni cobertura completa del lote pendiente.
