ALTER TABLE "tipsters" DROP CONSTRAINT "tipsters_slug_unique";--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "profit" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "followers" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tipsters" ALTER COLUMN "followers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "platform" text DEFAULT 'blogabet' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "profit_unit" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "price_currency" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "signup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tipsters" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tipsters_platform_slug" ON "tipsters" USING btree ("platform","slug");--> statement-breakpoint
CREATE INDEX "idx_tipsters_platform" ON "tipsters" USING btree ("platform");