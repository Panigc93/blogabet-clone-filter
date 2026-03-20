ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "last_reset_at" timestamp with time zone;
