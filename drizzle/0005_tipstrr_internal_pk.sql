-- Identidad Tipstrr por clave natural: (platform, slug) es la clave de
-- negocio operativa (ux_tipsters_platform_slug la impone desde 0004) y el
-- id numérico pasa a surrogate INTERNO transaccional para plataformas sin
-- id de origen verificado, no un índice del directorio Tipstrr. El slug es
-- la URL canónica hoy, pero una plataforma puede renombrar slugs: clave
-- OPERATIVA, no estabilidad universal. source_portfolio_id guarda el
-- portfolioId del origen como provenance opcional cuando una lectura lo
-- expone. import_validation_log registra cada validación fallida/skip FUERA
-- de la fila de tipsters (un yield antiguo no puede parecer re-confirmado
-- por la última captura). SQL generado por drizzle-kit desde db/schema.ts
-- + secuencia interna añadida a mano (drizzle no modela secuencias).
CREATE TABLE "import_validation_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"slug" text NOT NULL,
	"captured_at" timestamp with time zone,
	"class" text NOT NULL,
	"reason" text NOT NULL,
	"run_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "source_portfolio_id" integer;--> statement-breakpoint
CREATE INDEX "idx_import_validation_log_platform_slug" ON "import_validation_log" USING btree ("platform","slug");--> statement-breakpoint
-- Secuencia interna para ids de plataformas sin id de origen: espacio
-- negativo separado de los ids de Blogabet (positivos) y de -portfolioId.
-- La ruta de import asigna id = nextval('tipsters_internal_id_seq') dentro
-- de la transacción de upsert cuando no hay id de origen verificado.
CREATE SEQUENCE IF NOT EXISTS tipsters_internal_id_seq START WITH -2000000000 INCREMENT BY -1;