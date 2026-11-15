ALTER TABLE "tipsters" ADD COLUMN "picks_6m_avg" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "yield_3m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "yield_6m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "yield_12m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "picks_free_3m_avg" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "yield_free_3m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "stats_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_tipsters_yield_6m" ON "tipsters" USING btree ("yield_6m");--> statement-breakpoint
CREATE INDEX "idx_tipsters_picks_6m_avg" ON "tipsters" USING btree ("picks_6m_avg");