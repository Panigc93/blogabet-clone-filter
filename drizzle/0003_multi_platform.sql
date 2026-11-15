-- Multi-platform persistence (Tipstrr alongside Blogabet).
-- NOT EXECUTED against any database yet — applying it is a gated owner decision.
-- Delta is additive + two relaxations; existing Blogabet rows keep working
-- unchanged (platform/profit_unit/price_currency default to blogabet/eur/eur).
ALTER TABLE "tipsters" DROP CONSTRAINT "tipsters_slug_unique";--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "followers" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "followers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "profit" TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "platform" text DEFAULT 'blogabet' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "profit_unit" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "price_currency" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "signup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "captured_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_tipsters_platform_slug" ON "tipsters" USING btree ("platform","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipsters_platform" ON "tipsters" USING btree ("platform");
