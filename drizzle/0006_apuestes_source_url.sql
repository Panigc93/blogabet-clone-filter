-- URL exacta del perfil en el origen (evidencia del listado Apuestes:
-- 761 usernames no URL-safe que no se pueden reconstruir desde el slug).
-- Local draft para la integración Apuestes; NO aplicada en remoto.
ALTER TABLE "tipsters" ADD COLUMN "source_url" text;
