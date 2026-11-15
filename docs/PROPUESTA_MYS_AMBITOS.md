# Propuesta: muestra y yield por ámbito + indicios de seguibilidad (borrador, no aplicada)

Estado: solo documento. No hay migración aplicada, ni captura contra producción, ni UI conectada. Los datos de ejemplo son diagnósticos (3 blogs, capturados el 2026-11-15; ver `tests/crawler/fixtures/evidence-2026-11-15.json`).

## Qué dice el método y qué se puede comprobar
- Muestra >= 100 picks y yield >= 11% en la misma muestra: global, deporte o categoría. Se comprueba con las filas `sports` y `categories` de la pestaña elegida de `/blog/stats`.
- Seguibilidad: no se puede comprobar solo con estas páginas. Solo hay indicios.

## Ámbitos
- `global`: columnas actuales de `tipsters`.
- `sport`: fila de `sports`.
- `category`: fila de `categories`, con la clave original de Blogabet. Tipos: `live_aggregate` (Livebet), `combo_aggregate` (Combo pick), `unclassified` (puede ser competición o país). Un agregado live no acredita ninguna competición. No se suman categorías pequeñas para llegar a 100.

## Pestañas
`alltime`, `paid` y `private` son conjuntos de picks distintos. Se guardan por separado, con su denominador, y no se suman ni se atribuyen entre sí.

## Tabla propuesta (no aplicada)
`tipster_scope_stats`:
`tipster_id`, `tab` (alltime/paid/private), `scope_kind` (sport/category), `key` (clave original), `sport`, `category`, `category_kind`, `picks`, `win_rate`, `profit`, `yield`, `odds_avg`, `stake_avg`, `captured_at`, `source_sha256`. Clave única: (`tipster_id`, `tab`, `scope_kind`, `key`).
`tipster_follow_signals`: `tipster_id`, `tab`, `live_picks`, `total_picks`, `dominant_lead_bucket`, `bookies` (json con picks por casa), `captured_at`. Valores nulos cuando falta la sección; nunca ceros.

Captura: reutilizar la petición `/blog/stats` que ya hace `crawler/stats.ts` (una por tipster), sin peticiones nuevas, con la misma cadencia. No ejecutarla contra producción hasta aprobación.

## Texto de UI propuesto
- «Muestra y yield cumplen en: Football (14.475 picks, 13%) [pestaña alltime]».
- «Seguibilidad: sin comprobar» + indicios: gratis o de pago y precio, % LIVE con picks/total, casas publicadas, tramo de antelación mayoritario.
- No usar «cumple MYS» mientras la seguibilidad no esté acreditada.
- Aviso: cifras autodeclaradas; casas y antelación no prueban liquidez, cuota disponible ni que el pick llegara a tiempo.

## Límites conocidos
- Solo probado con 3 blogs. Falta comprobar más de pago, y si algunos no muestran la pestaña `paid` sin suscripción.
- No se sabe si una categoría es competición o país. Hay que verificarlo antes de etiquetarla.
- No hay cruce categoría x LIVE.
- Una categoría solo cumple si su propia fila llega a 100 picks y 11%.
