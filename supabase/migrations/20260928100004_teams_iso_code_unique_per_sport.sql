-- ============================================================
--  teams.iso_code: único por deporte, no en toda la tabla
--  Un tag de LoL podría coincidir algún día con el código de una
--  selección de fútbol. Se sustituye UNIQUE(iso_code) por
--  UNIQUE(sport_id, iso_code). NULLS NOT DISTINCT para que un
--  equipo sin deporte tampoco pueda duplicar código (hoy no hay
--  ninguno sin sport_id).
-- ============================================================

ALTER TABLE public.teams
  ADD CONSTRAINT teams_sport_iso_code_key
  UNIQUE NULLS NOT DISTINCT (sport_id, iso_code);

-- El UNIQUE original (schema_completo) no tiene nombre explícito:
-- se busca el que cubre exactamente (iso_code) en vez de suponerlo.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  WHERE con.conrelid = 'public.teams'::regclass
    AND con.contype  = 'u'
    AND con.conkey   = ARRAY[
      (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.teams'::regclass AND attname = 'iso_code')
    ]::smallint[];

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No se encontró el UNIQUE(iso_code) de teams';
  END IF;

  EXECUTE format('ALTER TABLE public.teams DROP CONSTRAINT %I', v_name);
  RAISE NOTICE 'Eliminado %', v_name;
END;
$$;
