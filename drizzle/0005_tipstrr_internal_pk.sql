-- BORRADOR 2026-11-15 — NO EJECUTAR sin decisión de despliegue coordinada.
-- Identidad Tipstrr por clave natural: (platform, slug) es la clave de
-- negocio operativa (ux_tipsters_platform_slug ya la impone desde 0004) y
-- el id numérico pasa a ser surrogate INTERNO transaccional, no un índice
-- del directorio Tipstrr ni un valor derivado del origen.
--
-- Motivo: el estado /stats no expone portfolioId, así que la convención
-- "PK = -portfolioId" haría depender el import de una lectura /results por
-- tipster solo para obtener un número. La clave (platform, slug) cumple la
-- unicidad y el upsert sin esa pasada. Limitación declarada: el slug es
-- la URL canónica hoy, pero una plataforma puede renombrar slugs; la clave
-- es OPERATIVA, no una garantía universal de estabilidad. Si una lectura
-- futura expone portfolioId, se guarda como provenance opcional:
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "source_portfolio_id" integer;--> statement-breakpoint
-- Secuencia interna para ids de plataformas sin id de origen: espacio
-- negativo separado de los ids de Blogabet (positivos) y de -portfolioId:
CREATE SEQUENCE IF NOT EXISTS tipsters_internal_id_seq START WITH -2000000000 INCREMENT BY -1;--> statement-breakpoint
-- La ruta de import asigna id = nextval('tipsters_internal_id_seq') dentro
-- de la transacción de upsert cuando no hay id de origen verificado.
