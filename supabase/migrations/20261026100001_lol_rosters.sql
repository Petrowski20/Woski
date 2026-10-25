-- ============================================================
--  LoL — plantillas de los equipos por competición
--  Tablas nuevas y funciones de admin. No toca puntuación ni filas
--  existentes.
--
--  * lol_players: jugador o entrenador (nick único sin distinguir
--    mayúsculas, nombre real opcional, país ISO 3166-1 alfa-2).
--  * lol_roster: quién juega en qué equipo y con qué rol en cada
--    edición (TOP, JUNGLE, MID, ADC, SUPPORT, COACH; puede haber
--    varios coaches). Un jugador, un equipo por edición. picks:
--    hasta 3 campeones (id de Data Dragon: "Ahri", "KSante"…).
--  Lectura pública (como teams); escritura solo con las funciones
--  admin_* (SECURITY DEFINER, ADMIN con lol_require_admin_actor(),
--  también el SQL Editor), que dejan registro en lol_admin_audit.
--  * admin_import_lol_roster: alta en lote desde el Excel (todo o
--    nada). Con p_replace, la plantilla de cada equipo del lote se
--    sustituye entera.
--  * admin_set_lol_roster_picks: los 3 campeones de un jugador.
--  * admin_remove_lol_roster_entry: quita a alguien de la plantilla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lol_players (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname   text NOT NULL CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 30 AND nickname = btrim(nickname)),
  real_name  text CHECK (real_name IS NULL OR char_length(real_name) BETWEEN 1 AND 80),
  country    text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lol_players_nickname_key ON public.lol_players (lower(nickname));

CREATE TABLE IF NOT EXISTS public.lol_roster (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition_id integer NOT NULL REFERENCES public.editions(id),
  team_id    integer NOT NULL REFERENCES public.teams(id),
  player_id  integer NOT NULL REFERENCES public.lol_players(id),
  role       text NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'COACH')),
  picks      text[] NOT NULL DEFAULT '{}'
             CHECK (cardinality(picks) <= 3 AND array_to_string(picks, ',') ~ '^([A-Za-z0-9]{2,24}(,[A-Za-z0-9]{2,24})*)?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_lol_roster_edition_team ON public.lol_roster (edition_id, team_id);

ALTER TABLE public.lol_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_roster  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lol_players_select_all" ON public.lol_players;
CREATE POLICY "lol_players_select_all" ON public.lol_players FOR SELECT USING (true);
DROP POLICY IF EXISTS "lol_roster_select_all" ON public.lol_roster;
CREATE POLICY "lol_roster_select_all" ON public.lol_roster FOR SELECT USING (true);
-- Sin políticas de escritura: solo las funciones de abajo escriben.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lol_players, public.lol_roster FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lol_players, public.lol_roster TO anon, authenticated;


-- Plantilla de un equipo en una edición, para la auditoría.
CREATE OR REPLACE FUNCTION public.lol_roster_snapshot(p_edition_id integer, p_team_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('role', r.role, 'player', p.nickname, 'country', p.country, 'picks', to_jsonb(r.picks))
                            ORDER BY array_position(ARRAY['TOP','JUNGLE','MID','ADC','SUPPORT','COACH'], r.role), r.id), '[]'::jsonb)
  FROM public.lol_roster r JOIN public.lol_players p ON p.id = r.player_id
  WHERE r.edition_id = p_edition_id AND r.team_id = p_team_id;
$$;

CREATE OR REPLACE FUNCTION public.lol_require_lol_edition(p_edition_id integer)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.editions e
    JOIN public.competitions c ON c.id = e.competition_id
    JOIN public.sports s       ON s.id = c.sport_id
    WHERE e.id = p_edition_id AND s.slug = 'lol'
  ) THEN
    RAISE EXCEPTION 'La edición % no existe o no es de LoL', p_edition_id USING ERRCODE = '22023';
  END IF;
END;
$$;


-- ------------------------------------------------------------
--  Alta en lote. p_rows: [{team, role, nickname, country?, real_name?}]
--  team = siglas del equipo de LoL; role = TOP|JUNGLE|MID|ADC|SUPPORT|COACH.
--  El jugador se busca por nick (sin distinguir mayúsculas); si no
--  existe se crea, y si viene país o nombre se actualizan.
--  Devuelve el número de filas cargadas.
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
  v_team    integer;
  v_player  integer;
  v_teams   integer[] := '{}';
  v_before  jsonb := '{}'::jsonb;
  v_t       integer;
  v_lol     integer := (SELECT id FROM public.sports WHERE slug = 'lol');
BEGIN
  PERFORM public.lol_require_lol_edition(p_edition_id);
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'La lista de jugadores está vacía' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 400 THEN
    RAISE EXCEPTION 'Como máximo 400 filas por carga' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lol_roster'), p_edition_id);

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
    DELETE FROM public.lol_roster WHERE edition_id = p_edition_id AND team_id = ANY (v_teams);
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

    -- Un jugador, un equipo por edición: si estaba en otro, se mueve.
    INSERT INTO public.lol_roster (edition_id, team_id, player_id, role)
    VALUES (p_edition_id, v_team, v_player, v_role)
    ON CONFLICT (edition_id, player_id) DO UPDATE SET team_id = EXCLUDED.team_id, role = EXCLUDED.role;
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


-- Hasta 3 campeones (id de Data Dragon) de alguien de la plantilla.
CREATE OR REPLACE FUNCTION public.admin_set_lol_roster_picks(
  p_roster_id integer,
  p_picks     text[],
  p_reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_picks  text[] := ARRAY(SELECT btrim(x) FROM unnest(coalesce(p_picks, '{}')) x WHERE btrim(x) <> '');
  r        record;
BEGIN
  SELECT * INTO r FROM public.lol_roster WHERE id = p_roster_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa entrada de la plantilla no existe' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_picks) > 3 THEN
    RAISE EXCEPTION 'Como máximo 3 campeones' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_picks) x WHERE x !~ '^[A-Za-z0-9]{2,24}$') THEN
    RAISE EXCEPTION 'Campeón no válido: usa el identificador de Riot (Ahri, KSante, MonkeyKing…)' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT lower(x)) FROM unnest(v_picks) x) < cardinality(v_picks) THEN
    RAISE EXCEPTION 'Un campeón está repetido' USING ERRCODE = '22023';
  END IF;
  IF r.picks = v_picks THEN
    RETURN;
  END IF;
  UPDATE public.lol_roster SET picks = v_picks WHERE id = p_roster_id;
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, edition_id, before, after, reason)
  VALUES (auth.uid(), v_actor, 'set_roster_picks', r.team_id, r.edition_id,
          jsonb_build_object('player_id', r.player_id, 'picks', to_jsonb(r.picks)),
          jsonb_build_object('player_id', r.player_id, 'picks', to_jsonb(v_picks)),
          NULLIF(btrim(p_reason), ''));
END;
$$;


-- Quita a alguien de la plantilla de una edición (el jugador se queda).
CREATE OR REPLACE FUNCTION public.admin_remove_lol_roster_entry(p_roster_id integer, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  r        record;
  v_before jsonb;
BEGIN
  SELECT * INTO r FROM public.lol_roster WHERE id = p_roster_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa entrada de la plantilla no existe' USING ERRCODE = '22023';
  END IF;
  v_before := public.lol_roster_snapshot(r.edition_id, r.team_id);
  DELETE FROM public.lol_roster WHERE id = p_roster_id;
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, edition_id, before, after, reason)
  VALUES (auth.uid(), v_actor, 'remove_roster_entry', r.team_id, r.edition_id,
          jsonb_build_object('roster', v_before),
          jsonb_build_object('roster', public.lol_roster_snapshot(r.edition_id, r.team_id)),
          NULLIF(btrim(p_reason), ''));
END;
$$;


REVOKE ALL ON FUNCTION public.lol_roster_snapshot(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_require_lol_edition(integer)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_import_lol_roster(integer, jsonb, boolean, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_set_lol_roster_picks(integer, text[], text)      FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_remove_lol_roster_entry(integer, text)           FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_lol_roster(integer, jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_roster_picks(integer, text[], text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_lol_roster_entry(integer, text)           TO authenticated;
