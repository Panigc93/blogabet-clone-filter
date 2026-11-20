-- 0006 Apuestes source_url. Generada con drizzle-kit generate (journal +
-- snapshot 0006 incluidos para que drizzle-kit migrate la aplique), con una
-- poda manual: la salida de generate también incluía CREATE TABLE
-- "olbg_published_snapshots" (drift preexistente: la tabla existe en Neon
-- desde el trabajo OLBG pero nunca tuvo migración). Ese CREATE TABLE se
-- omite aquí: la tabla ya existe en producción y crearla rompería la
-- migración. Ese drift OLBG es de otra plataforma y merece su propia
-- decisión; esta migración solo añade source_url a tipsters.
ALTER TABLE "tipsters" ADD COLUMN "source_url" text;
