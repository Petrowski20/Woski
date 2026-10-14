-- ============================================================
--  PLANTILLA — añadir UNA serie de LoL a una fase existente
--  (p. ej. los cruces de la doble eliminación del Play-In de
--  Worlds 2026, que se conocen según avanza el torneo).
--
--  Uso: copia el bloque, cambia SOLO la sección PARÁMETROS y
--  ejecútalo en el SQL Editor. No es una migración.
--
--  * Idempotente: si ya existe una serie en esa fase con el mismo
--    local, visitante y fecha, no hace nada (NOTICE).
--  * Si el mismo cruce ya existe con OTRA fecha, avisa (NOTICE)
--    pero la crea igualmente: en doble eliminación dos equipos se
--    pueden volver a cruzar. Si lo que querías era cambiar la hora
--    de una serie ya cargada, NO uses la plantilla: usa el UPDATE
--    del final.
--  * Valida: fase y equipos existen (equipo por sigla dentro de
--    LoL, una sola fila), local ≠ visitante, best_of ∈ {1, 3, 5} y
--    que la votación no estaría ya cerrada al crearla.
--  * Si algo falla, RAISE EXCEPTION: no se inserta nada.
-- ============================================================

DO $$
DECLARE
  -- ===================== PARÁMETROS =====================
  p_competition text        := 'worlds';    -- competitions.slug
  p_edition     text        := '2026';      -- editions.name
  p_phase       text        := 'Play-In';   -- phases.name
  p_home_tag    text        := 'KC';        -- teams.iso_code del local
  p_away_tag    text        := 'FUR';       -- teams.iso_code del visitante
  -- Fecha y hora de inicio en UTC. Escribe SIEMPRE el "+00": sin
  -- él se interpreta en la zona de la sesión.
  p_date_utc    timestamptz := '2026-10-17 18:00:00+00';
  p_best_of     integer     := 5;           -- 1, 3 o 5
  -- ======================================================

  v_sport_id  integer;
  v_phase_id  integer;
  v_home_id   integer;
  v_away_id   integer;
  v_n         integer;
  v_cutoff    integer;
  v_match_id  integer;
BEGIN
  SELECT id INTO v_sport_id FROM public.sports WHERE slug = 'lol';

  -- Fase --------------------------------------------------
  SELECT ph.id INTO v_phase_id
  FROM public.phases ph
  JOIN public.editions e     ON e.id = ph.edition_id
  JOIN public.competitions c ON c.id = e.competition_id
  WHERE c.slug = p_competition
    AND c.sport_id = v_sport_id
    AND e.name = p_edition
    AND ph.name = p_phase;
  IF v_phase_id IS NULL THEN
    RAISE EXCEPTION 'No existe la fase "%" en % %', p_phase, p_competition, p_edition;
  END IF;

  -- Equipos (por sigla, solo LoL, exactamente uno) ---------
  SELECT COUNT(*), MIN(id) INTO v_n, v_home_id
  FROM public.teams WHERE sport_id = v_sport_id AND iso_code = p_home_tag;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'La sigla local "%" corresponde a % equipos de LoL (se esperaba 1)', p_home_tag, v_n;
  END IF;

  SELECT COUNT(*), MIN(id) INTO v_n, v_away_id
  FROM public.teams WHERE sport_id = v_sport_id AND iso_code = p_away_tag;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'La sigla visitante "%" corresponde a % equipos de LoL (se esperaba 1)', p_away_tag, v_n;
  END IF;

  IF v_home_id = v_away_id THEN
    RAISE EXCEPTION 'Local y visitante son el mismo equipo (%)', p_home_tag;
  END IF;

  -- Formato -------------------------------------------------
  IF p_best_of IS NULL OR p_best_of NOT IN (1, 3, 5) THEN
    RAISE EXCEPTION 'best_of debe ser 1, 3 o 5 (recibido %)', p_best_of;
  END IF;

  -- Corte de votación: el del ruleset de la fase (60 min si falta),
  -- mismo cálculo que lol_prediction_cutoff_minutes.
  SELECT CASE
           WHEN jsonb_typeof(r.config -> 'prediction_cutoff_minutes') = 'number'
            AND (r.config ->> 'prediction_cutoff_minutes')::numeric >= 0
           THEN (r.config ->> 'prediction_cutoff_minutes')::numeric::integer
           ELSE 60
         END
  INTO v_cutoff
  FROM public.phases ph
  JOIN public.rulesets r ON r.id = ph.ruleset_id
  WHERE ph.id = v_phase_id;

  IF now() >= p_date_utc - make_interval(mins => v_cutoff) THEN
    RAISE EXCEPTION 'Con inicio % la votación ya estaría cerrada (corte % min). ¿Fecha bien escrita y en UTC?',
      p_date_utc, v_cutoff;
  END IF;

  -- Duplicados ----------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE phase_id = v_phase_id
      AND home_team_id = v_home_id
      AND away_team_id = v_away_id
      AND match_date = p_date_utc
  ) THEN
    RAISE NOTICE 'Ya existe % vs % el % en "%": no se crea nada.', p_home_tag, p_away_tag, p_date_utc, p_phase;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE phase_id = v_phase_id
      AND status <> 'CANCELLED'
      AND ((home_team_id = v_home_id AND away_team_id = v_away_id)
        OR (home_team_id = v_away_id AND away_team_id = v_home_id))
  ) THEN
    RAISE NOTICE 'Aviso: % y % ya se cruzan en "%" en otra fecha. Se crea la serie nueva (revancha). Si era un cambio de hora, bórrala y usa el UPDATE.',
      p_home_tag, p_away_tag, p_phase;
  END IF;

  -- Alta ----------------------------------------------------
  INSERT INTO public.matches (home_team_id, away_team_id, match_date, status, phase_id, metadata)
  VALUES (v_home_id, v_away_id, p_date_utc, 'PENDING', v_phase_id,
          jsonb_build_object('best_of', p_best_of))
  RETURNING id INTO v_match_id;

  RAISE NOTICE 'Creada serie % : % vs % · % UTC · Bo% · fase "%"',
    v_match_id, p_home_tag, p_away_tag, p_date_utc, p_best_of, p_phase;
END;
$$;


-- ============================================================
--  OPCIONAL — equipo nuevo (si la sigla aún no existe en LoL).
--  Toma sigla/región/país de la tabla de 61 equipos de
--  20260928100003_team_tag_and_metadata.sql. Ejecútalo antes del
--  bloque de arriba.
-- ============================================================
-- INSERT INTO public.teams (sport_id, slug, name, iso_code, metadata)
-- SELECT s.id, 'lol-xxx', 'Nombre Equipo', 'XXX',
--        jsonb_build_object('region', 'EMEA', 'country', 'FR')
-- FROM public.sports s
-- WHERE s.slug = 'lol'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.teams t
--     WHERE t.slug = 'lol-xxx'
--        OR (t.sport_id = s.id AND (t.iso_code = 'XXX' OR lower(t.name) = lower('Nombre Equipo')))
--   );


-- ============================================================
--  OPCIONAL — cambiar la hora de una serie ya cargada (sin votos
--  perdidos: las predicciones cuelgan del id del partido).
-- ============================================================
-- UPDATE public.matches m
-- SET match_date = TIMESTAMPTZ '2026-10-17 20:00:00+00'
-- FROM public.phases ph, public.editions e, public.competitions c
-- WHERE ph.id = m.phase_id AND e.id = ph.edition_id AND c.id = e.competition_id
--   AND c.slug = 'worlds' AND e.name = '2026' AND ph.name = 'Play-In'
--   AND m.status = 'PENDING'
--   AND m.home_team_id = (SELECT id FROM public.teams WHERE slug = 'lol-kc')
--   AND m.away_team_id = (SELECT id FROM public.teams WHERE slug = 'lol-fur')
--   AND m.match_date   = TIMESTAMPTZ '2026-10-17 18:00:00+00';
