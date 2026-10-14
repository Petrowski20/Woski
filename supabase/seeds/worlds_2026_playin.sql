-- ============================================================
--  DATOS — Worlds 2026 · Play-In
--  No es una migración: no va en supabase/migrations ni se
--  registra en el historial. Se ejecuta a mano en el SQL Editor
--  (pegando el archivo entero) o con psql -f.
--
--  Dos sentencias independientes:
--    1. Un único bloque DO con toda la carga. Es UNA sentencia, así
--       que es atómica por sí misma: si algo falla no se aplica
--       nada, aunque el editor no mantenga la sesión entre
--       sentencias. No usa tablas temporales ni BEGIN/COMMIT.
--    2. Una consulta de comprobación de solo lectura que se puede
--       ejecutar sola en cualquier momento.
--
--  Crea (solo si no existe):
--    * competición "worlds" (ya existe en remoto como "Worlds":
--      se reutiliza y NO se renombra)
--    * ruleset "LoL Worlds Play-In": copia de "LoL Series (default)"
--      con default_best_of = 5 (el original no se toca)
--    * edición "2026" de Worlds, zona America/Los_Angeles
--    * fase "Play-In"
--    * equipos C9, MVK y FUR (KC ya existe: lol-kc). Sigla, región
--      y país = tabla de 61 equipos de
--      20260928100003_team_tag_and_metadata.sql. Sin logos.
--    * 2 series Bo5 en estado PENDING
--
--  Idempotente: cada alta comprueba antes si la fila existe, así
--  que ejecutarlo dos veces no duplica nada (los NOTICE dicen qué
--  se creó y qué ya estaba). No hace UPDATE ni DELETE de filas
--  existentes (la edición "LEC 2026 · Prueba" no se toca).
--
--  Ids: ninguno fijo, todo se resuelve por slug / nombre / sigla.
--  best_of: no hay columna; vive en matches.metadata->>'best_of'
--  (prioridad: metadata.best_of > ruleset.default_best_of > 3).
-- ============================================================


-- ------------------------------------------------------------
--  1. Carga
-- ------------------------------------------------------------
DO $$
DECLARE
  -- ##########################################################
  -- ##  FECHAS DE LA EDICIÓN — EDITA AQUÍ                    ##
  -- ##  "Activa" en la app = start_date <= hoy <= end_date   ##
  -- ##  (hoy en hora de Madrid). Solo controlan cuándo se    ##
  -- ##  ve la edición. Solo se aplican al CREARLA: si la     ##
  -- ##  edición ya existe, cambiarlas aquí no hace nada      ##
  -- ##  (usa un UPDATE de editions).                         ##
  -- ##########################################################
  c_start_date CONSTANT date := DATE '2026-10-14';
  c_end_date   CONSTANT date := DATE '2026-11-14';   -- ⚠ END_DATE
  -- ##########################################################

  v_sport_id   integer;
  v_comp_id    integer;
  v_ruleset_id integer;
  v_edition_id integer;
  v_phase_id   integer;
  v_team_ids   jsonb := '{}'::jsonb;   -- sigla → teams.id
  v_n          integer;
  v_id         integer;
  r            record;
BEGIN
  -- Comprobaciones previas ----------------------------------
  SELECT id INTO v_sport_id FROM public.sports WHERE slug = 'lol';
  IF v_sport_id IS NULL THEN
    RAISE EXCEPTION 'No existe el deporte lol';
  END IF;
  IF (SELECT COUNT(*) FROM public.rulesets WHERE name = 'LoL Series (default)') <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente un ruleset "LoL Series (default)"';
  END IF;

  -- Secuencias de teams y matches: mismo criterio que
  -- lol_test_edition.sql (el Mundial se cargó con ids explícitos).
  -- Solo adelanta la secuencia hasta MAX(id); nunca la retrasa.
  PERFORM setval(pg_get_serial_sequence('public.teams', 'id'),
                 GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.teams), (SELECT last_value FROM public.teams_id_seq)));
  PERFORM setval(pg_get_serial_sequence('public.matches', 'id'),
                 GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.matches), (SELECT last_value FROM public.matches_id_seq)));

  -- Competición (en remoto ya existe slug 'worlds') ----------
  SELECT id INTO v_comp_id FROM public.competitions WHERE slug = 'worlds';
  IF v_comp_id IS NULL THEN
    INSERT INTO public.competitions (sport_id, slug, name)
    VALUES (v_sport_id, 'worlds', 'World Championship')
    RETURNING id INTO v_comp_id;
    RAISE NOTICE 'Competición worlds: creada (id %)', v_comp_id;
  ELSE
    RAISE NOTICE 'Competición worlds: ya existía (id %)', v_comp_id;
  END IF;

  -- Ruleset propio: copia del de LoL por defecto, Bo5.
  -- Hereda todo lo demás (3 exacto / 1 ganador; sin
  -- prediction_cutoff_minutes → corte de 60 min).
  SELECT COUNT(*), MIN(id) INTO v_n, v_ruleset_id
  FROM public.rulesets WHERE name = 'LoL Worlds Play-In';
  IF v_n > 1 THEN
    RAISE EXCEPTION 'Hay % rulesets "LoL Worlds Play-In"', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.rulesets (name, config)
    SELECT 'LoL Worlds Play-In', r0.config || jsonb_build_object('default_best_of', 5)
    FROM public.rulesets r0
    WHERE r0.name = 'LoL Series (default)'
    RETURNING id INTO v_ruleset_id;
    RAISE NOTICE 'Ruleset LoL Worlds Play-In: creado (id %)', v_ruleset_id;
  ELSE
    RAISE NOTICE 'Ruleset LoL Worlds Play-In: ya existía (id %)', v_ruleset_id;
  END IF;

  -- Edición 2026 ---------------------------------------------
  SELECT COUNT(*), MIN(id) INTO v_n, v_edition_id
  FROM public.editions WHERE competition_id = v_comp_id AND name = '2026';
  IF v_n > 1 THEN
    RAISE EXCEPTION 'Hay % ediciones "2026" de Worlds', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.editions (competition_id, name, start_date, end_date, timezone)
    VALUES (v_comp_id, '2026', c_start_date, c_end_date, 'America/Los_Angeles')
    RETURNING id INTO v_edition_id;
    RAISE NOTICE 'Edición Worlds 2026: creada (id %, % → %)', v_edition_id, c_start_date, c_end_date;
  ELSE
    RAISE NOTICE 'Edición Worlds 2026: ya existía (id %), fechas sin cambios', v_edition_id;
  END IF;

  -- Fase Play-In (única fase por ahora) ----------------------
  SELECT COUNT(*), MIN(id) INTO v_n, v_phase_id
  FROM public.phases WHERE edition_id = v_edition_id AND name = 'Play-In';
  IF v_n > 1 THEN
    RAISE EXCEPTION 'Hay % fases "Play-In" en Worlds 2026', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.phases (edition_id, ruleset_id, name, "order")
    VALUES (v_edition_id, v_ruleset_id, 'Play-In', 0)
    RETURNING id INTO v_phase_id;
    RAISE NOTICE 'Fase Play-In: creada (id %)', v_phase_id;
  ELSE
    RAISE NOTICE 'Fase Play-In: ya existía (id %)', v_phase_id;
  END IF;

  -- Equipos ----------------------------------------------------
  -- Un equipo "ya existe" si hay uno con el mismo slug, o uno de
  -- LoL con la misma sigla o el mismo nombre (sin distinguir
  -- mayúsculas: la tabla de 61 lo llama "Furia"). Solo se crean
  -- los que faltan; los existentes no se modifican. Después cada
  -- equipo debe resolverse a UNA sola fila de LoL; si no, se
  -- aborta todo (evita colgar partidos de un equipo equivocado).
  FOR r IN
    SELECT * FROM (VALUES
      ('lol-kc',  'Karmine Corp', 'KC',  'EMEA', 'FR'),
      ('lol-c9',  'Cloud9',       'C9',  'NA',   'US'),
      ('lol-mvk', 'MVK Esports',  'MVK', 'APAC', 'VN'),
      ('lol-fur', 'FURIA',        'FUR', 'BR',   'BR')
    ) AS t(slug, name, tag, region, country)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.slug = r.slug
         OR (t.sport_id = v_sport_id AND (t.iso_code = r.tag OR lower(t.name) = lower(r.name)))
    ) THEN
      INSERT INTO public.teams (sport_id, slug, name, iso_code, metadata)
      VALUES (v_sport_id, r.slug, r.name, r.tag,
              jsonb_build_object('region', r.region, 'country', r.country));
      RAISE NOTICE 'Equipo %: creado', r.tag;
    ELSE
      RAISE NOTICE 'Equipo %: ya existía', r.tag;
    END IF;

    SELECT COUNT(DISTINCT t.id), MIN(t.id) INTO v_n, v_id
    FROM public.teams t
    WHERE t.sport_id = v_sport_id
      AND (t.slug = r.slug OR t.iso_code = r.tag OR lower(t.name) = lower(r.name));
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'El equipo % se resuelve a % filas de LoL (se esperaba 1)', r.tag, v_n;
    END IF;
    v_team_ids := v_team_ids || jsonb_build_object(r.tag, v_id);
  END LOOP;

  -- Series del Play-In (Bo5, PENDING) -------------------------
  -- Una serie "ya existe" si en la misma fase hay otra con el
  -- mismo local, visitante y fecha. Para cambiar la hora de una
  -- serie ya cargada usa UPDATE (si cambias la fecha aquí y lo
  -- vuelves a ejecutar, crearía una segunda serie).
  FOR r IN
    SELECT * FROM (VALUES
      ('KC',  'C9',  TIMESTAMPTZ '2026-10-15 18:00:00+00', 5),
      ('FUR', 'MVK', TIMESTAMPTZ '2026-10-15 23:00:00+00', 5)
    ) AS s(home_tag, away_tag, match_date, best_of)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.phase_id     = v_phase_id
        AND m.home_team_id = (v_team_ids ->> r.home_tag)::integer
        AND m.away_team_id = (v_team_ids ->> r.away_tag)::integer
        AND m.match_date   = r.match_date
    ) THEN
      RAISE NOTICE 'Serie % vs %: ya existía', r.home_tag, r.away_tag;
    ELSE
      INSERT INTO public.matches (home_team_id, away_team_id, match_date, status, phase_id, metadata)
      VALUES ((v_team_ids ->> r.home_tag)::integer,
              (v_team_ids ->> r.away_tag)::integer,
              r.match_date,
              'PENDING',
              v_phase_id,
              jsonb_build_object('best_of', r.best_of))
      RETURNING id INTO v_id;
      RAISE NOTICE 'Serie % vs %: creada (id %)', r.home_tag, r.away_tag, v_id;
    END IF;
  END LOOP;
END;
$$;


-- ------------------------------------------------------------
--  2. Comprobación (solo lectura, independiente: se puede
--     ejecutar sola, antes o después de la carga)
-- ------------------------------------------------------------
SELECT c.name                          AS competicion,
       e.name                          AS edicion,
       e.start_date,
       e.end_date,
       e.timezone,
       ph.name                         AS fase,
       r.name                          AS ruleset,
       r.config ->> 'default_best_of'  AS default_bo,
       m.id                            AS match_id,
       th.iso_code                     AS local,
       ta.iso_code                     AS visitante,
       m.match_date,
       m.status,
       m.metadata ->> 'best_of'        AS best_of,
       m.prediction_locks_at
FROM public.competitions c
JOIN public.editions e   ON e.competition_id = c.id AND e.name = '2026'
JOIN public.phases ph    ON ph.edition_id = e.id
JOIN public.rulesets r   ON r.id = ph.ruleset_id
LEFT JOIN public.matches m  ON m.phase_id = ph.id
LEFT JOIN public.teams th   ON th.id = m.home_team_id
LEFT JOIN public.teams ta   ON ta.id = m.away_team_id
WHERE c.slug = 'worlds'
ORDER BY ph."order", m.match_date;
