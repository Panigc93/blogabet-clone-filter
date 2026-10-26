ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "is_verified" boolean DEFAULT false NOT NULL;
