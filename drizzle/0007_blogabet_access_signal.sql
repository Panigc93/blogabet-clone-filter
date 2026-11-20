-- 0007 Blogabet access signal (Free/Pago tri-state desde señal de perfil).
-- Draft LOCAL, no aplicada en remoto: aplicarla en Neon es decisión posterior
-- con su impacto descrito (docs/verified-access-review.md). Tres columnas
-- nullable; la migración en sí no reclasifica ninguna fila.
ALTER TABLE "tipsters" ADD COLUMN "access_class" text;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "access_evidence" text;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "access_observed_at" timestamp with time zone;
