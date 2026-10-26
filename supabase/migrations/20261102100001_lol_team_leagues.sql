-- ============================================================
--  LoL — liga de cada equipo y plantilla actual
--  Para ver equipos fuera de una competición (Equipos → LCK, LEC…
--  y "Resto del mundo"). No toca puntuación ni series.
--
--  * teams.league: sigla de la liga del equipo (LCK, LPL, LEC…), del
--    equipo y no de la edición. Se rellena con la liga de su seed más
--    reciente (team_edition_stats.league). NULL = "Resto del mundo".
--  * lol_roster.edition_id pasa a admitir NULL: la plantilla ACTUAL
--    del equipo, aparte de la de cada competición (que no cambia con
--    los fichajes). Un jugador está como mucho en una plantilla
--    actual (índice único parcial).
--  * admin_import_lol_roster: p_edition_id NULL carga la plantilla
--    actual; cada fila admite "league" (opcional, la misma para todo
--    el equipo), que cambia teams.league con su registro
--    (set_team_league). Misma firma.
--  * admin_set_lol_team_league: pone, cambia o quita la liga de un
--    equipo, con registro en lol_admin_audit.
--  * lol_roster_snapshot compara la edición con IS NOT DISTINCT FROM
--    (para la plantilla actual).
-- ============================================================

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS league text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_league_check') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_league_check
      CHECK (league IS NULL OR league ~ '^[A-Z0-9]{2,8}$');
  END IF;
END;
$$;
COMMENT ON COLUMN public.teams.league IS
  'LoL: sigla de la liga del equipo (LCK, LEC…). NULL = sin liga (Resto del mundo).';

-- Liga del seed más reciente de cada equipo de LoL que aún no la tenga.
UPDATE public.teams t
SET league = s.league
FROM (
  SELECT DISTINCT ON (tes.team_id) tes.team_id, tes.league
  FROM public.team_edition_stats tes
  JOIN public.editions e ON e.id = tes.edition_id
  WHERE tes.league IS NOT NULL
  ORDER BY tes.team_id, e.start_date DESC NULLS LAST, e.id DESC
) s
WHERE t.id = s.team_id
  AND t.league IS NULL
  AND public.is_lol_team(t.id);

-- Plantilla actual: edition_id NULL.
ALTER TABLE public.lol_roster ALTER COLUMN edition_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lol_roster_current_player_key
  ON public.lol_roster (player_id) WHERE edition_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lol_roster_current_team
  ON public.lol_roster (team_id) WHERE edition_id IS NULL;


CREATE OR REPLACE FUNCTION public.lol_roster_snapshot(p_edition_id integer, p_team_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('role', r.role, 'player', p.nickname, 'country', p.country, 'picks', to_jsonb(r.picks))
                            ORDER BY array_position(ARRAY['TOP','JUNGLE','MID','ADC','SUPPORT','COACH'], r.role), r.id), '[]'::jsonb)
  FROM public.lol_roster r JOIN public.lol_players p ON p.id = r.player_id
  WHERE r.edition_id IS NOT DISTINCT FROM p_edition_id AND r.team_id = p_team_id;
$$;


-- ------------------------------------------------------------
--  Alta en lote. p_rows: [{team, role, nickname, country?, real_name?, league?}]
--  p_edition_id NULL = plantilla actual. Igual que 20261026100001
--  salvo la plantilla actual y la liga.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_import_lol_roster(
  p_edition_id integer,
  p_rows       jsonb,
  p_replace    boolean DEFAULT true,
  p_reason     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   text := public.lol_require_admin_actor();
  v_row     jsonb;
  v_i       integer := 0;
  v_tag     text;
  v_role    text;
  v_nick    text;
  v_country text;
  v_real    text;
  v_league  text;
  v_leagues jsonb := '{}'::jsonb;
  v_old_lg  text;
  v_team    integer;
  v_player  integer;
  v_teams   integer[] := '{}';
  v_before  jsonb := '{}'::jsonb;
  v_t       integer;
  v_lol     integer := (SELECT id FROM public.sports WHERE slug = 'lol');
BEGIN
  -- p_edition_id NULL = plantilla actual (sin competición).
  IF p_edition_id IS NOT NULL THEN
    PERFORM public.lol_require_lol_edition(p_edition_id);
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'La lista de jugadores está vacía' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 400 THEN
    RAISE EXCEPTION 'Como máximo 400 filas por carga' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lol_roster'), COALESCE(p_edition_id, 0));

  -- 1. Validar todo y resolver equipos antes de escribir nada.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Fila %: debe ser un objeto con team, role y nickname', v_i USING ERRCODE = '22023';
    END IF;
    v_tag     := upper(btrim(coalesce(v_row ->> 'team', '')));
    v_role    := upper(btrim(coalesce(v_row ->> 'role', '')));
    v_nick    := btrim(coalesce(v_row ->> 'nickname', ''));
    v_country := upper(NULLIF(btrim(coalesce(v_row ->> 'country', '')), ''));
    SELECT t.id INTO v_team FROM public.teams t WHERE t.sport_id = v_lol AND upper(t.iso_code) = v_tag;
    IF v_team IS NULL THEN
      RAISE EXCEPTION 'Fila % (%): no hay ningún equipo de LoL con las siglas "%"', v_i, v_nick, v_tag USING ERRCODE = '22023';
    END IF;
    IF v_role NOT IN ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'COACH') THEN
      RAISE EXCEPTION 'Fila % (%): rol "%" no válido (TOP, JUNGLE, MID, ADC, SUPPORT o COACH)', v_i, v_nick, v_role USING ERRCODE = '22023';
    END IF;
    IF char_length(v_nick) NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Fila %: el nick debe tener entre 1 y 30 caracteres', v_i USING ERRCODE = '22023';
    END IF;
    IF v_country IS NOT NULL AND v_country !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'Fila % (%): país "%" no válido (código de 2 letras: ES, KR…)', v_i, v_nick, v_country USING ERRCODE = '22023';
    END IF;
    -- Liga opcional del equipo (teams.league); la misma en todas sus filas.
    v_league := upper(NULLIF(btrim(coalesce(v_row ->> 'league', '')), ''));
    IF v_league IS NOT NULL THEN
      IF v_league !~ '^[A-Z0-9]{2,8}$' THEN
        RAISE EXCEPTION 'Fila % (%): liga "%" no válida (sigla de 2 a 8 letras o números: LCK, LEC…)', v_i, v_nick, v_league USING ERRCODE = '22023';
      END IF;
      IF v_leagues ? v_team::text AND v_leagues ->> v_team::text <> v_league THEN
        RAISE EXCEPTION 'Fila % (%): el equipo "%" tiene dos ligas distintas en la carga', v_i, v_nick, v_tag USING ERRCODE = '22023';
      END IF;
      v_leagues := v_leagues || jsonb_build_object(v_team::text, v_league);
    END IF;
    IF NOT v_team = ANY (v_teams) THEN
      v_teams := v_teams || v_team;
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT lower(btrim(x ->> 'nickname'))) FROM jsonb_array_elements(p_rows) x) < jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'Hay un jugador repetido en la carga (cada jugador, una sola vez)' USING ERRCODE = '22023';
  END IF;

  -- 2. Foto de antes y, si se sustituye, vaciar la plantilla de esos equipos.
  FOREACH v_t IN ARRAY v_teams LOOP
    v_before := v_before || jsonb_build_object(v_t::text, public.lol_roster_snapshot(p_edition_id, v_t));
  END LOOP;
  IF p_replace THEN
    DELETE FROM public.lol_roster WHERE edition_id IS NOT DISTINCT FROM p_edition_id AND team_id = ANY (v_teams);
  END IF;

  -- 3. Jugadores y plantilla.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_tag     := upper(btrim(v_row ->> 'team'));
    v_role    := upper(btrim(v_row ->> 'role'));
    v_nick    := btrim(v_row ->> 'nickname');
    v_country := upper(NULLIF(btrim(coalesce(v_row ->> 'country', '')), ''));
    v_real    := NULLIF(btrim(coalesce(v_row ->> 'real_name', '')), '');
    SELECT t.id INTO v_team FROM public.teams t WHERE t.sport_id = v_lol AND upper(t.iso_code) = v_tag;

    SELECT p.id INTO v_player FROM public.lol_players p WHERE lower(p.nickname) = lower(v_nick);
    IF v_player IS NULL THEN
      INSERT INTO public.lol_players (nickname, real_name, country) VALUES (v_nick, v_real, v_country) RETURNING id INTO v_player;
    ELSE
      UPDATE public.lol_players
      SET country = COALESCE(v_country, country), real_name = COALESCE(v_real, real_name)
      WHERE id = v_player;
    END IF;

    -- Un jugador, un equipo por edición (y uno en la plantilla actual):
    -- si estaba en otro, se mueve.
    IF p_edition_id IS NULL THEN
      INSERT INTO public.lol_roster (edition_id, team_id, player_id, role)
      VALUES (NULL, v_team, v_player, v_role)
      ON CONFLICT (player_id) WHERE edition_id IS NULL
      DO UPDATE SET team_id = EXCLUDED.team_id, role = EXCLUDED.role;
    ELSE
      INSERT INTO public.lol_roster (edition_id, team_id, player_id, role)
      VALUES (p_edition_id, v_team, v_player, v_role)
      ON CONFLICT (edition_id, player_id) DO UPDATE SET team_id = EXCLUDED.team_id, role = EXCLUDED.role;
    END IF;
  END LOOP;

  -- Ligas que vienen en la carga (solo si cambian; con su registro).
  FOR v_t IN SELECT key::integer FROM jsonb_each_text(v_leagues) LOOP
    SELECT league INTO v_old_lg FROM public.teams WHERE id = v_t;
    IF v_old_lg IS DISTINCT FROM v_leagues ->> v_t::text THEN
      UPDATE public.teams SET league = v_leagues ->> v_t::text WHERE id = v_t;
      INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, before, after, reason)
      VALUES (auth.uid(), v_actor, 'set_team_league', v_t,
              jsonb_build_object('league', v_old_lg), jsonb_build_object('league', v_leagues ->> v_t::text),
              NULLIF(btrim(p_reason), ''));
    END IF;
  END LOOP;

  FOREACH v_t IN ARRAY v_teams LOOP
    INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, edition_id, before, after, reason)
    VALUES (auth.uid(), v_actor, 'import_roster', v_t, p_edition_id,
            jsonb_build_object('roster', v_before -> v_t::text),
            jsonb_build_object('roster', public.lol_roster_snapshot(p_edition_id, v_t)),
            NULLIF(btrim(p_reason), ''));
  END LOOP;

  RETURN jsonb_array_length(p_rows);
END;
$$;

-- ------------------------------------------------------------
--  Liga de un equipo de LoL ('' o NULL la quita).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_lol_team_league(
  p_team_id integer,
  p_league  text,
  p_reason  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_league text := upper(NULLIF(btrim(coalesce(p_league, '')), ''));
  v_before text;
BEGIN
  IF NOT public.is_lol_team(p_team_id) THEN
    RAISE EXCEPTION 'El equipo % no existe o no es de LoL', p_team_id USING ERRCODE = '22023';
  END IF;
  IF v_league IS NOT NULL AND v_league !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'La liga debe ser una sigla de 2 a 8 letras o números (LCK, LPL, LEC…)' USING ERRCODE = '22023';
  END IF;

  SELECT league INTO v_before FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_before IS NOT DISTINCT FROM v_league THEN
    RETURN;
  END IF;
  UPDATE public.teams SET league = v_league WHERE id = p_team_id;
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, before, after, reason)
  VALUES (auth.uid(), v_actor, 'set_team_league', p_team_id,
          jsonb_build_object('league', v_before), jsonb_build_object('league', v_league),
          NULLIF(btrim(p_reason), ''));
END;
$$;


REVOKE ALL ON FUNCTION public.lol_roster_snapshot(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_import_lol_roster(integer, jsonb, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_lol_roster(integer, jsonb, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_lol_team_league(integer, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_team_league(integer, text, text) TO authenticated;
