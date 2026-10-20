-- ============================================================
--  LoL — perfil de un jugador visto por otros (/jugador/[id])
--  Solo crea funciones de lectura; no toca tablas, permisos de
--  tablas ni la lógica de puntos.
--
--  Visibilidad: la misma que ya aplica la RLS de predictions
--  (predictions_lol_select_after_close, RESTRICTIVE): cualquier
--  usuario autenticado ve el voto de otro jugador en una serie con
--  la votación CERRADA (NOT lol_voting_open), sin filtro de club ni
--  liga (la clasificación global ya lista a todos). Nunca se
--  devuelve nada de una serie con la votación abierta.
--
--  * get_lol_player_history: series de la edición con la votación
--    cerrada (no canceladas) desde el primer voto VISIBLE del
--    jugador, con su voto (o sin voto) y el desglose del motor
--    (lol_score_breakdown) cuando la serie ha terminado.
--  * get_lol_player_days: plenos positivos y negativos por jornada
--    y lo que sumaron. Sale de comparar lol_standings_at al cierre
--    de cada jornada con la anterior: el mismo cálculo que la
--    clasificación, sin repetir sus reglas.
--  Las dos: SECURITY DEFINER, search_path fijo, EXECUTE solo para
--  authenticated y, por la API, con usuario (auth.uid()); el SQL
--  Editor también puede consultarlas.
-- ============================================================


CREATE OR REPLACE FUNCTION public.get_lol_player_history(p_profile_id uuid, p_edition_id integer)
RETURNS TABLE (
  match_id       integer,
  match_date     timestamptz,
  day            date,
  phase_id       integer,
  phase_name     text,
  phase_order    integer,
  status         text,
  best_of        integer,
  featured       boolean,
  home_team_id   integer,
  away_team_id   integer,
  home_goals     integer,
  away_goals     integer,
  voted          boolean,
  pred_home      integer,
  pred_away      integer,
  points_earned  integer,
  rules_version  integer,
  correct_winner boolean,
  correct_score  boolean,
  base_winner    integer,
  base_exact     integer,
  streak_length  integer,
  streak_bonus   integer,
  featured_bonus integer,
  total          integer,
  explanation    jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- Por la API hace falta un usuario; el SQL Editor (sesión postgres sin
  -- JWT) puede consultarla, como las demás funciones de LoL.
  IF auth.uid() IS NULL
     AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') IS NOT NULL THEN
    RAISE EXCEPTION 'Inicia sesión para ver el historial de un jugador' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH closed AS (
    SELECT mt.id, mt.match_date, mt.status::text AS status, mt.home_team_id, mt.away_team_id,
           mt.home_goals, mt.away_goals, mt.metadata, mt.phase_id,
           ph.name AS phase_name, ph."order" AS phase_order, e.timezone, r.config
    FROM public.matches  mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE ph.edition_id = p_edition_id
      AND mt.status <> 'CANCELLED'
      AND public.is_lol_match(mt.id)
      AND NOT public.lol_voting_open(mt.id)
  ),
  -- Primer voto entre las series cerradas: un voto en una serie aún
  -- abierta no puede influir en lo que se devuelve.
  first_vote AS (
    SELECT c.match_date AS d, c.id
    FROM closed c
    JOIN public.predictions x ON x.match_id = c.id AND x.profile_id = p_profile_id
    ORDER BY c.match_date, c.id
    LIMIT 1
  )
  SELECT c.id::integer,
         c.match_date,
         (c.match_date AT TIME ZONE c.timezone)::date,
         c.phase_id::integer,
         c.phase_name::text,
         c.phase_order::integer,
         c.status,
         public.lol_series_best_of(c.metadata, c.config),
         COALESCE(c.metadata -> 'featured_match' = 'true'::jsonb, false),
         c.home_team_id::integer,
         c.away_team_id::integer,
         c.home_goals::integer,
         c.away_goals::integer,
         x.id IS NOT NULL,
         x.pred_home_goals::integer,
         x.pred_away_goals::integer,
         x.points_earned::integer,
         b.rules_version,
         b.correct_winner,
         b.correct_score,
         b.base_winner,
         b.base_exact,
         b.streak_length,
         b.streak_bonus,
         b.featured_bonus,
         b.total,
         b.explanation
  FROM closed c
  CROSS JOIN first_vote f
  LEFT JOIN public.predictions x ON x.match_id = c.id AND x.profile_id = p_profile_id
  LEFT JOIN LATERAL public.lol_score_breakdown(p_profile_id, c.id::integer) b ON true
  WHERE (c.match_date, c.id) >= (f.d, f.id)
  ORDER BY c.match_date DESC, c.id DESC;
END;
$$;


-- Plenos por jornada: diferencia de lol_standings_at entre el cierre
-- de cada jornada con series terminadas y el de la anterior. Solo
-- devuelve las jornadas con pleno (positivo o negativo).
-- pleno_points = lo que sumó el pleno (puntos del día menos los de
-- sus series).
CREATE OR REPLACE FUNCTION public.get_lol_player_days(p_profile_id uuid, p_edition_id integer)
RETURNS TABLE (
  day          date,
  perfect      boolean,
  negative     boolean,
  pleno_points integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- Por la API hace falta un usuario; el SQL Editor (sesión postgres sin
  -- JWT) puede consultarla, como las demás funciones de LoL.
  IF auth.uid() IS NULL
     AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') IS NOT NULL THEN
    RAISE EXCEPTION 'Inicia sesión para ver el historial de un jugador' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT DISTINCT (mt.match_date AT TIME ZONE e.timezone)::date AS d
    FROM public.matches  mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE ph.edition_id = p_edition_id
      AND mt.status = 'FINISHED'
      AND public.is_lol_match(mt.id)
  ),
  st AS (
    SELECT dd.d, s.perfect_days, s.negative_days, s.total_points
    FROM days dd
    CROSS JOIN LATERAL public.lol_standings_at(p_edition_id, NULL, dd.d) s
    WHERE s.profile_id = p_profile_id
  ),
  delta AS (
    SELECT st.d,
           st.perfect_days  - COALESCE(LAG(st.perfect_days)  OVER w, 0) AS dp,
           st.negative_days - COALESCE(LAG(st.negative_days) OVER w, 0) AS dn,
           st.total_points  - COALESCE(LAG(st.total_points)  OVER w, 0) AS dt
    FROM st
    WINDOW w AS (ORDER BY st.d)
  ),
  day_points AS (
    SELECT (mt.match_date AT TIME ZONE e.timezone)::date AS d, SUM(COALESCE(x.points_earned, 0)) AS pts
    FROM public.predictions x
    JOIN public.matches  mt ON mt.id = x.match_id
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE x.profile_id = p_profile_id
      AND ph.edition_id = p_edition_id
      AND mt.status = 'FINISHED'
    GROUP BY 1
  )
  SELECT dl.d, dl.dp > 0, dl.dn > 0, (dl.dt - COALESCE(dp.pts, 0))::integer
  FROM delta dl
  LEFT JOIN day_points dp ON dp.d = dl.d
  WHERE dl.dp > 0 OR dl.dn > 0
  ORDER BY dl.d;
END;
$$;


REVOKE ALL ON FUNCTION public.get_lol_player_history(uuid, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_lol_player_days(uuid, integer)    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_lol_player_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lol_player_days(uuid, integer)    TO authenticated;
