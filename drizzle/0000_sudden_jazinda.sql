CREATE TABLE "tipsters" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"flag_url" text,
	"country_code" text,
	"is_paid" boolean DEFAULT false NOT NULL,
	"price" numeric(8, 2),
	"since_year" smallint,
	"picks" integer DEFAULT 0 NOT NULL,
	"profit" numeric(10, 2),
	"yield" numeric(6, 2),
	"verified_pct" numeric(5, 2),
	"followers" integer DEFAULT 0 NOT NULL,
	"last_pick_at" timestamp with time zone,
	"reset_count" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "tipsters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "idx_tipsters_yield" ON "tipsters" USING btree ("yield");--> statement-breakpoint
CREATE INDEX "idx_tipsters_profit" ON "tipsters" USING btree ("profit");--> statement-breakpoint
CREATE INDEX "idx_tipsters_picks" ON "tipsters" USING btree ("picks");--> statement-breakpoint
CREATE INDEX "idx_tipsters_followers" ON "tipsters" USING btree ("followers");--> statement-breakpoint
CREATE INDEX "idx_tipsters_since_year" ON "tipsters" USING btree ("since_year");--> statement-breakpoint
CREATE INDEX "idx_tipsters_last_pick_at" ON "tipsters" USING btree ("last_pick_at");--> statement-breakpoint
CREATE INDEX "idx_tipsters_is_paid" ON "tipsters" USING btree ("is_paid");