-- ============================================================
--  LoL — premios de una edición (general o por fase, global o pool)
--  Solo crea una función de lectura; no toca tablas, RLS ni la
--  lógica de puntos. Nada se guarda: se recalcula con los
--  resultados y reglas actuales, como la clasificación.
--
--  get_lol_awards(edición, pool, fase) devuelve una fila por
--  ganador de cada premio (empate = premio compartido). Un premio
--  con máximo 0 no tiene ganador.
--
--  Base común (la misma que lol_standings_at):
--  * Jugadores: los de la clasificación de ese ámbito (sin ocultos;
--    en un pool, sus miembros; en una fase, quien tiene series de
--    la fase).
--  * Series de cada jugador: terminadas, desde su primer voto de la
--    edición (y en un pool, desde su entrada), solo de la fase si se
--    pide. Una serie sin votar cuenta como fallo.
--  * Participación mínima (para que no gane quien votó dos series):
--    3 votos y al menos la mitad de sus series votadas. El Dormilón
--    solo exige los 3 votos.
--  * Reparto de votos: entre todos los votantes no ocultos de la
--    serie (como la puntuación).
--
--  Premios (award):
--    streak        racha más larga de ganadores acertados (series;
--                  en v2 por fase, como la racha de la clasificación)
--    hits          más ganadores acertados
--    accuracy      mejor % de ganadores acertados sobre sus votos
--    exact         más marcadores exactos (Bo3/Bo5)
--    perfect       más plenos positivos
--    contrarian    más aciertos votando lo que votó < 25 % (o solo él)
--    golden_day    más puntos de series en una jornada (detail = día)
--    leader        más jornadas acabando líder
--    rocket        mayor subida de puestos de una jornada a la
--                  siguiente (detail = día)
--    jinx          racha más larga de fallos (incluye no votar)
--    negative      más plenos negativos
--    sleeper       más series sin votar
--    sheep         más votos con la mayoría (> 50 %)
--    uyyy          ganador acertado y marcador a un mapa (Bo3/Bo5)
--    rollercoaster mayor caída de puestos en una jornada (detail = día)
--    fan           más votos al mismo equipo (detail = tag del equipo)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_lol_awards(
  p_edition_id integer,
  p_pool_id    integer DEFAULT NULL,
  p_phase_id   integer DEFAULT NULL
)
RETURNS TABLE (
  award      text,
  profile_id uuid,
  nickname   text,
  avatar_url text,
  value      numeric,
  detail     text
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
    RAISE EXCEPTION 'Inicia sesión para ver los premios' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           mt.home_team_id,
           mt.away_team_id,
           mt.home_goals,
           mt.away_goals,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day,
           public.lol_series_best_of(mt.metadata, r.config) AS best_of,
           public.lol_ruleset_version(r.config) = 2         AS is_v2
    FROM public.matches  mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE e.id = p_edition_id
      AND mt.status <> 'CANCELLED'
  ),
  scope_matches AS (
    SELECT * FROM edition_matches
    WHERE status = 'FINISHED'
      AND home_goals IS NOT NULL
      AND away_goals IS NOT NULL
      AND (p_phase_id IS NULL OR phase_id = p_phase_id)
  ),
  standing AS (
    SELECT * FROM public.lol_standings_at(p_edition_id, p_pool_id, NULL, p_phase_id)
  ),
  first_votes AS (
    SELECT DISTINCT ON (pr.profile_id)
           pr.profile_id AS pid, em.match_date AS first_date, em.id AS first_id
    FROM public.predictions pr
    JOIN edition_matches em ON em.id = pr.match_id
    ORDER BY pr.profile_id, em.match_date, em.id
  ),
  pool_joins AS (
    SELECT pm.profile_id AS pid,
           MIN((pm.joined_at AT TIME ZONE e.timezone)::date) AS joined_day
    FROM public.pool_members pm
    JOIN public.pools    po ON po.id = pm.pool_id
    JOIN public.editions e  ON e.id  = po.edition_id
    WHERE p_pool_id IS NOT NULL
      AND pm.pool_id = p_pool_id
      AND po.edition_id = p_edition_id
    GROUP BY pm.profile_id
  ),
  players AS (
    SELECT s.profile_id AS pid, s.perfect_days, s.negative_days,
           fv.first_date, fv.first_id, pj.joined_day
    FROM standing s
    JOIN first_votes fv ON fv.pid = s.profile_id
    LEFT JOIN pool_joins pj ON pj.pid = s.profile_id
  ),

  -- Reparto: por serie y ganador votado, entre votantes no ocultos.
  shares AS (
    SELECT pr.match_id,
           sign(pr.pred_home_goals - pr.pred_away_goals) AS side,
           COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY pr.match_id) AS share
    FROM public.predictions pr
    JOIN public.profiles pf ON pf.id = pr.profile_id AND NOT pf.is_hidden
    WHERE pr.match_id IN (SELECT id FROM scope_matches)
    GROUP BY pr.match_id, sign(pr.pred_home_goals - pr.pred_away_goals)
  ),

  -- Series que cuentan para cada jugador, con su voto (o sin él).
  ps AS (
    SELECT p.pid,
           m.id, m.match_date, m.day, m.phase_id, m.is_v2, m.best_of,
           m.home_team_id, m.away_team_id, m.home_goals, m.away_goals,
           pr.profile_id IS NOT NULL                 AS voted,
           pr.pred_home_goals                        AS vh,
           pr.pred_away_goals                        AS va,
           COALESCE(pr.points_earned, 0)             AS pts,
           COALESCE(pr.is_correct_winner, false)     AS ok,
           COALESCE(pr.is_correct_score, false)      AS exact,
           sh.share
    FROM players p
    JOIN scope_matches m
      ON (m.match_date, m.id) >= (p.first_date, p.first_id)
     AND (p.joined_day IS NULL OR m.day >= p.joined_day)
    LEFT JOIN public.predictions pr ON pr.profile_id = p.pid AND pr.match_id = m.id
    LEFT JOIN shares sh
      ON sh.match_id = m.id
     AND sh.side = sign(pr.pred_home_goals - pr.pred_away_goals)
  ),
  participation AS (
    SELECT pid,
           COUNT(*) FILTER (WHERE voted) AS votes,
           COUNT(*)                      AS series
    FROM ps
    GROUP BY pid
  ),

  -- Rachas: tramos seguidos de aciertos / fallos (en v2, por fase).
  runs AS (
    SELECT pid, ok,
           CASE WHEN is_v2 THEN phase_id ELSE 0 END AS run_key,
           ROW_NUMBER() OVER (PARTITION BY pid, CASE WHEN is_v2 THEN phase_id ELSE 0 END ORDER BY match_date, id)
         - ROW_NUMBER() OVER (PARTITION BY pid, CASE WHEN is_v2 THEN phase_id ELSE 0 END, ok ORDER BY match_date, id) AS grp
    FROM ps
  ),
  run_lengths AS (
    SELECT pid, ok, COUNT(*) AS len
    FROM runs
    GROUP BY pid, ok, run_key, grp
  ),

  -- Clasificación al cierre de cada jornada con series terminadas.
  days AS (
    SELECT DISTINCT day FROM scope_matches
  ),
  day_ranks AS (
    SELECT d.day, s.profile_id AS pid, s.rank_position AS rnk
    FROM days d
    CROSS JOIN LATERAL public.lol_standings_at(p_edition_id, p_pool_id, d.day, p_phase_id) s
  ),
  rank_moves AS (
    SELECT pid, day, rnk,
           LAG(rnk) OVER (PARTITION BY pid ORDER BY day) - rnk AS gained
    FROM day_ranks
  ),

  day_points AS (
    SELECT pid, day, SUM(pts) AS pts
    FROM ps
    GROUP BY pid, day
  ),
  team_votes AS (
    SELECT pid,
           CASE WHEN vh > va THEN home_team_id ELSE away_team_id END AS team_id,
           COUNT(*) AS n
    FROM ps
    WHERE voted
    GROUP BY pid, 2
  ),

  -- Un valor por jugador y premio. detail: lo que acompaña al valor.
  metrics AS (
    SELECT pid, 'streak'::text AS award, MAX(len)::numeric AS value, NULL::text AS detail
    FROM run_lengths WHERE ok GROUP BY pid
    UNION ALL
    SELECT pid, 'jinx', MAX(len), NULL FROM run_lengths WHERE NOT ok GROUP BY pid
    UNION ALL
    SELECT pid, 'hits', COUNT(*) FILTER (WHERE ok), NULL FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'accuracy',
           round(100.0 * COUNT(*) FILTER (WHERE ok) / NULLIF(COUNT(*) FILTER (WHERE voted), 0), 1), NULL
    FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'exact', COUNT(*) FILTER (WHERE exact AND best_of > 1), NULL FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'contrarian', COUNT(*) FILTER (WHERE ok AND share < 0.25), NULL FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'sheep', COUNT(*) FILTER (WHERE voted AND share > 0.5), NULL FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'uyyy',
           COUNT(*) FILTER (WHERE ok AND NOT exact AND best_of > 1
                              AND abs(LEAST(vh, va) - LEAST(home_goals, away_goals)) = 1), NULL
    FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'sleeper', COUNT(*) FILTER (WHERE NOT voted), NULL FROM ps GROUP BY pid
    UNION ALL
    SELECT pid, 'perfect', perfect_days, NULL FROM players
    UNION ALL
    SELECT pid, 'negative', negative_days, NULL FROM players
    UNION ALL
    (SELECT DISTINCT ON (pid) pid, 'golden_day', pts, day::text
     FROM day_points ORDER BY pid, pts DESC, day)
    UNION ALL
    SELECT pid, 'leader', COUNT(*) FILTER (WHERE rnk = 1), NULL FROM day_ranks GROUP BY pid
    UNION ALL
    (SELECT DISTINCT ON (pid) pid, 'rocket', gained, day::text
     FROM rank_moves WHERE gained > 0 ORDER BY pid, gained DESC, day)
    UNION ALL
    (SELECT DISTINCT ON (pid) pid, 'rollercoaster', -gained, day::text
     FROM rank_moves WHERE gained < 0 ORDER BY pid, gained ASC, day)
    UNION ALL
    (SELECT DISTINCT ON (tv.pid) tv.pid, 'fan', tv.n, t.iso_code
     FROM team_votes tv
     JOIN public.teams t ON t.id = tv.team_id
     ORDER BY tv.pid, tv.n DESC, t.iso_code)
  ),
  eligible AS (
    SELECT m.*
    FROM metrics m
    JOIN participation pa ON pa.pid = m.pid
    WHERE pa.votes >= 3
      AND (m.award = 'sleeper' OR pa.votes * 2 >= pa.series)
      AND m.value > 0
  ),
  winners AS (
    SELECT el.*, MAX(el.value) OVER (PARTITION BY el.award) AS best
    FROM eligible el
  )
  SELECT w.award, w.pid, pf.nickname, pf.avatar_url, w.value, w.detail
  FROM winners w
  JOIN public.profiles pf ON pf.id = w.pid
  WHERE w.value = w.best
  ORDER BY w.award, pf.nickname;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lol_awards(integer, integer, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_lol_awards(integer, integer, integer) TO authenticated;
