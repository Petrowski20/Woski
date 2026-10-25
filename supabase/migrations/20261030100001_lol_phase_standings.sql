-- ============================================================
--  LoL — clasificación por fase y campeones
--  Solo cambia funciones de lectura; no toca tablas, RLS ni la
--  lógica de puntos (points_earned sigue igual).
--
--  * lol_standings_at(edición, pool, corte, fase): la de siempre con
--    un filtro de fase. Con p_phase_id cuenta solo las series de esa
--    fase: puntos, aciertos, plenos (jornadas con series de la fase),
--    racha y mejor racha de la fase. La ventana de cada jugador sigue
--    empezando en su primer voto de la EDICIÓN (y en un pool, en su
--    entrada), así que una serie de la fase sin votar cuenta como
--    fallo igual que en la general. En una fase solo aparece quien
--    tiene alguna serie de la fase dentro de su ventana.
--    Puntos de la general = suma de los de cada fase, salvo que una
--    misma jornada mezcle series de dos fases (el pleno se mira por
--    fase).
--  * Desempate de la general: puntos → plenos positivos → mejor
--    racha de toda la edición (en v2, la mejor de cualquier fase; en
--    v1, de toda la edición) → antigüedad. Antes era la mejor racha
--    de la fase en curso, que cambiaba al empezar una fase nueva. En
--    una fase, la mejor racha de esa fase (igual que antes). La
--    columna best_streak sigue siendo la de la fase en curso (o la
--    de la fase pedida).
--  * lol_standings_at(edición, pool, corte) pasa a llamar a la nueva
--    con fase NULL: get_lol_player_days y los tests no cambian.
--  * get_lol_standings(edición, pool, fase DEFAULT NULL): con fase,
--    la clasificación de esa fase y el movimiento respecto a la
--    jornada anterior de la fase. Sustituye a la de 2 argumentos
--    (misma llamada desde la app).
--  Los campeones no se guardan: el primero de la clasificación de
--  una fase con todas sus series terminadas o canceladas (lo decide
--  la app con las series).
-- ============================================================


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte, opcionalmente de una fase.
--  Igual que 20261023100001 salvo lo marcado arriba.
-- ------------------------------------------------------------

CREATE FUNCTION public.lol_standings_at(
  p_edition_id integer,
  p_pool_id    integer,
  p_until      date,
  p_phase_id   integer
)
RETURNS TABLE (
  profile_id      uuid,
  total_points    bigint,
  correct_winners bigint,
  finished_series bigint,
  perfect_days    bigint,
  negative_days   bigint,
  current_streak  integer,
  best_streak     integer,
  rank_position   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day,
           public.lol_ruleset_version(r.config) = 2 AS is_v2,
           public.lol_ruleset_version(r.config) = 2
             AND COALESCE(r.config -> 'streak_bonus' -> 'count_exact_score' = 'true'::jsonb, false)
             AND public.lol_series_best_of(mt.metadata, r.config) > 1 AS exact_counts,
           public.lol_ruleset_version(r.config) = 2
             AND COALESCE(r.config -> 'streak_bonus' -> 'count_exact_score' = 'true'::jsonb, false)
             AND COALESCE(r.config -> 'streak_bonus' -> 'exact_as_prediction' = 'true'::jsonb, false)
             AND public.lol_series_best_of(mt.metadata, r.config) > 1 AS exact_step
    FROM public.matches mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE e.id = p_edition_id
      AND mt.status <> 'CANCELLED'
  ),
  -- Ventana: hasta la fecha de corte y, con p_phase_id, solo esa
  -- fase. first_votes sigue mirando toda la edición: la ventana de
  -- cada jugador empieza en su primer voto de la edición, igual que
  -- en la general.
  in_range AS (
    SELECT * FROM edition_matches
    WHERE (p_until IS NULL OR day <= p_until)
      AND (p_phase_id IS NULL OR phase_id = p_phase_id)
  ),
  closed_days AS (
    SELECT day
    FROM in_range
    GROUP BY day
    HAVING COUNT(*) = COUNT(*) FILTER (WHERE status = 'FINISHED')
  ),
  -- Valor de los plenos de cada jornada: ruleset de la fase de su
  -- última serie.
  day_rules AS (
    SELECT DISTINCT ON (ir.day)
           ir.day,
           CASE WHEN public.lol_ruleset_version(r.config) = 2
                THEN COALESCE((r.config -> 'perfect_day' ->> 'negative')::integer, 0)
                ELSE -1 END AS negative_pts,
           CASE WHEN public.lol_ruleset_version(r.config) = 2
                THEN COALESCE((r.config -> 'perfect_day' ->> 'positive')::integer, 0)
                ELSE 0 END AS positive_pts
    FROM in_range ir
    JOIN public.phases   ph ON ph.id = ir.phase_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    ORDER BY ir.day, ir.match_date DESC, ir.id DESC
  ),

  -- Serie del primer voto de cada jugador en la edición.
  first_votes AS (
    SELECT DISTINCT ON (pr.profile_id)
           pr.profile_id AS pid, em.match_date AS first_date, em.id AS first_id
    FROM public.predictions pr
    JOIN edition_matches em ON em.id = pr.match_id
    ORDER BY pr.profile_id, em.match_date, em.id
  ),
  -- Jornada de entrada al pool (en la zona horaria de la edición).
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

  -- Quién aparece: Global = cualquiera con una predicción en la
  -- edición; pool = sus miembros (aunque no hayan votado).
  -- first_id NULL (nunca ha votado) → no cuenta ninguna serie.
  base AS (
    SELECT p.id AS pid,
           p.created_at,
           fv.first_date,
           fv.first_id,
           pj.joined_day
    FROM public.profiles p
    LEFT JOIN first_votes fv ON fv.pid = p.id
    LEFT JOIN pool_joins  pj ON pj.pid = p.id
    WHERE NOT p.is_hidden
      AND (
        (p_pool_id IS NULL     AND fv.pid IS NOT NULL)
        OR
        (p_pool_id IS NOT NULL AND pj.pid IS NOT NULL)
      )
  ),

  -- Series de la ventana que cuentan para cada jugador.
  player_series AS (
    SELECT b.pid, ir.id, ir.status, ir.match_date, ir.phase_id, ir.day, ir.is_v2, ir.exact_counts, ir.exact_step
    FROM base b
    JOIN in_range ir
      ON b.first_id IS NOT NULL
     AND (ir.match_date, ir.id) >= (b.first_date, b.first_id)
     AND (b.joined_day IS NULL OR ir.day >= b.joined_day)
  ),
  -- Predicciones sobre series terminadas que cuentan.
  preds AS (
    SELECT s.pid,
           s.id                                  AS match_id,
           s.day,
           COALESCE(pr.points_earned, 0)         AS pts,
           COALESCE(pr.is_correct_winner, false) AS ok,
           COALESCE(pr.is_correct_score, false)  AS exact
    FROM player_series s
    JOIN public.predictions pr ON pr.profile_id = s.pid AND pr.match_id = s.id
    WHERE s.status = 'FINISHED'
  ),
  pred_days AS (
    SELECT pid, day, SUM(pts) AS pts, COUNT(*) AS voted, COUNT(*) FILTER (WHERE ok) AS hits
    FROM preds
    GROUP BY pid, day
  ),
  -- Jornadas que cuentan: las cerradas con alguna serie que cuente
  -- (n_series = solo esas) y las abiertas en las que ya tiene puntos.
  player_days AS (
    SELECT s.pid, s.day, COUNT(*) AS n_series
    FROM player_series s
    JOIN closed_days cd ON cd.day = s.day
    GROUP BY s.pid, s.day
    UNION ALL
    SELECT pd.pid, pd.day, NULL
    FROM pred_days pd
    WHERE NOT EXISTS (SELECT 1 FROM closed_days cd WHERE cd.day = pd.day)
  ),
  day_scores AS (
    SELECT d.pid,
           d.day,
           COALESCE(pd.pts, 0) AS pts,
           (d.n_series IS NOT NULL
            AND COALESCE(pd.voted, 0) = d.n_series
            AND COALESCE(pd.hits, 0)  = d.n_series)              AS perfect,
           (d.n_series IS NOT NULL AND COALESCE(pd.hits, 0) = 0) AS negative
    FROM player_days d
    LEFT JOIN pred_days pd ON pd.pid = d.pid AND pd.day = d.day
  ),
  own AS (
    SELECT ds.pid,
           SUM(ds.pts
               + CASE WHEN ds.negative THEN COALESCE(dr.negative_pts, -1) ELSE 0 END
               + CASE WHEN ds.perfect  THEN COALESCE(dr.positive_pts, 0)  ELSE 0 END) AS pts,
           COUNT(*) FILTER (WHERE ds.perfect)  AS perfects,
           COUNT(*) FILTER (WHERE ds.negative) AS negatives
    FROM day_scores ds
    LEFT JOIN day_rules dr ON dr.day = ds.day
    GROUP BY ds.pid
  ),
  hits AS (
    SELECT pid, COUNT(*) FILTER (WHERE ok) AS correct
    FROM preds
    GROUP BY pid
  ),
  played AS (
    SELECT pid, COUNT(*) AS n
    FROM player_series
    WHERE status = 'FINISHED'
    GROUP BY pid
  ),

  -- Rachas: predicciones de las series terminadas que cuentan,
  -- en orden (las no votadas son fallos). k = 1 ganador; k = 2
  -- marcador, solo con exact_as_prediction en Bo3/Bo5. gain = lo
  -- que suma un acierto (2 con count_exact_score sin
  -- exact_as_prediction y exacto acertado).
  seq AS (
    SELECT s.pid,
           s.id,
           s.phase_id,
           s.is_v2,
           s.match_date,
           ev.k,
           CASE WHEN ev.k = 1 THEN COALESCE(p.ok, false)
                ELSE COALESCE(p.ok AND p.exact, false) END AS ok,
           CASE WHEN ev.k = 1 AND NOT s.exact_step
                     AND COALESCE(p.ok, false) AND s.exact_counts AND p.exact
                THEN 2 ELSE 1 END AS gain,
           ROW_NUMBER() OVER (PARTITION BY s.pid ORDER BY s.match_date, s.id, ev.k) AS rn
    FROM player_series s
    CROSS JOIN LATERAL (SELECT 1 AS k UNION ALL SELECT 2 WHERE s.exact_step) ev
    LEFT JOIN preds p ON p.pid = s.pid AND p.match_id = s.id
    WHERE s.status = 'FINISHED'
  ),
  current_phase AS (
    SELECT f.phase_id,
           public.lol_ruleset_version(r.config) = 2 AS is_v2
    FROM in_range f
    JOIN public.phases   ph ON ph.id = f.phase_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE f.status = 'FINISHED'
    ORDER BY f.match_date DESC, f.id DESC
    LIMIT 1
  ),
  -- v2: solo las predicciones de la fase en curso (las de otras
  -- fases ni suman ni cortan, como en lol_score_breakdown).
  -- v1: toda la edición.
  current_seq AS (
    SELECT s.*
    FROM seq s
    CROSS JOIN current_phase cp
    WHERE NOT cp.is_v2 OR s.phase_id = cp.phase_id
  ),
  last_reset AS (
    SELECT pid, COALESCE(MAX(rn) FILTER (WHERE NOT ok), 0) AS rn
    FROM current_seq
    GROUP BY pid
  ),
  current_streak AS (
    SELECT s.pid, COALESCE(SUM(s.gain) FILTER (WHERE s.rn > lr.rn), 0)::integer AS streak
    FROM current_seq s
    JOIN last_reset lr ON lr.pid = s.pid
    GROUP BY s.pid
  ),
  phase_runs AS (
    SELECT pid,
           ok,
           gain,
           ROW_NUMBER() OVER (PARTITION BY pid ORDER BY rn)
         - ROW_NUMBER() OVER (PARTITION BY pid, ok ORDER BY rn) AS grp
    FROM seq
    WHERE phase_id = (SELECT phase_id FROM current_phase)
  ),
  best_streak AS (
    SELECT pid, MAX(len)::integer AS best
    FROM (SELECT pid, grp, SUM(gain) AS len FROM phase_runs WHERE ok GROUP BY pid, grp) r
    GROUP BY pid
  ),
  -- Mejor racha de toda la ventana (desempate de la general): en v2
  -- cada fase tiene su racha (no se encadenan); en v1, toda la edición.
  window_runs AS (
    SELECT pid,
           ok,
           gain,
           CASE WHEN is_v2 THEN phase_id ELSE 0 END AS run_key,
           ROW_NUMBER() OVER (PARTITION BY pid, CASE WHEN is_v2 THEN phase_id ELSE 0 END ORDER BY rn)
         - ROW_NUMBER() OVER (PARTITION BY pid, CASE WHEN is_v2 THEN phase_id ELSE 0 END, ok ORDER BY rn) AS grp
    FROM seq
  ),
  window_best AS (
    SELECT pid, MAX(len)::integer AS best
    FROM (SELECT pid, run_key, grp, SUM(gain) AS len FROM window_runs WHERE ok GROUP BY pid, run_key, grp) r
    GROUP BY pid
  ),

  totals AS (
    SELECT b.pid,
           b.created_at,
           COALESCE(o.pts, 0)                  AS total_points,
           COALESCE(h.correct, 0)              AS correct_winners,
           COALESCE(pl.n, 0)                   AS finished_series,
           COALESCE(o.perfects, 0)             AS perfect_days,
           COALESCE(o.negatives, 0)            AS negative_days,
           COALESCE(cs.streak, 0)              AS current_streak,
           COALESCE(bs.best, 0)                AS best_streak,
           COALESCE(wb.best, 0)                AS window_best
    FROM base b
    LEFT JOIN own            o  ON o.pid  = b.pid
    LEFT JOIN hits           h  ON h.pid  = b.pid
    LEFT JOIN played         pl ON pl.pid = b.pid
    LEFT JOIN current_streak cs ON cs.pid = b.pid
    LEFT JOIN best_streak    bs ON bs.pid = b.pid
    LEFT JOIN window_best    wb ON wb.pid = b.pid
    -- En una fase solo aparece quien tiene alguna serie de la fase
    -- dentro de su ventana.
    WHERE p_phase_id IS NULL
       OR EXISTS (SELECT 1 FROM player_series ps WHERE ps.pid = b.pid)
  )
  SELECT t.pid,
         t.total_points::bigint,
         t.correct_winners::bigint,
         t.finished_series::bigint,
         t.perfect_days::bigint,
         t.negative_days::bigint,
         t.current_streak,
         t.best_streak,
         ROW_NUMBER() OVER (
           ORDER BY t.total_points DESC,
                    t.perfect_days DESC,
                    t.window_best  DESC,
                    t.created_at   ASC
         )
  FROM totals t;
$$;

REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date, integer) FROM PUBLIC, anon, authenticated;


-- La de 3 argumentos: la general (sin fase). Misma firma y RETURNS,
-- así que CREATE OR REPLACE conserva sus permisos.
CREATE OR REPLACE FUNCTION public.lol_standings_at(
  p_edition_id integer,
  p_pool_id    integer,
  p_until      date
)
RETURNS TABLE (
  profile_id      uuid,
  total_points    bigint,
  correct_winners bigint,
  finished_series bigint,
  perfect_days    bigint,
  negative_days   bigint,
  current_streak  integer,
  best_streak     integer,
  rank_position   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.lol_standings_at(p_edition_id, p_pool_id, p_until, NULL::integer);
$$;

REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
--  Clasificación actual (general o de una fase), global o de un
--  pool, con el movimiento respecto al final de la jornada anterior
--  (+ = sube). movement NULL si todavía no hay jornada anterior.
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_lol_standings(integer, integer);

CREATE FUNCTION public.get_lol_standings(
  p_edition_id integer,
  p_pool_id    integer DEFAULT NULL,
  p_phase_id   integer DEFAULT NULL
)
RETURNS TABLE (
  profile_id      uuid,
  nickname        text,
  avatar_url      text,
  total_points    bigint,
  correct_winners bigint,
  finished_series bigint,
  perfect_days    bigint,
  negative_days   bigint,
  current_streak  integer,
  best_streak     integer,
  rank_position   bigint,
  movement        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH finished_days AS (
    SELECT DISTINCT (mt.match_date AT TIME ZONE e.timezone)::date AS day
    FROM public.matches mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE e.id = p_edition_id
      AND (p_phase_id IS NULL OR ph.id = p_phase_id)
      AND mt.status = 'FINISHED'
  ),
  previous_day AS (
    SELECT MAX(day) AS day
    FROM finished_days
    WHERE day < (SELECT MAX(day) FROM finished_days)
  ),
  now_rows AS (
    SELECT * FROM public.lol_standings_at(p_edition_id, p_pool_id, NULL, p_phase_id)
  ),
  before_rows AS (
    SELECT s.profile_id, s.rank_position
    FROM previous_day pd
    CROSS JOIN LATERAL public.lol_standings_at(p_edition_id, p_pool_id, pd.day, p_phase_id) s
    WHERE pd.day IS NOT NULL
  )
  SELECT n.profile_id,
         p.nickname,
         p.avatar_url,
         n.total_points,
         n.correct_winners,
         n.finished_series,
         n.perfect_days,
         n.negative_days,
         n.current_streak,
         n.best_streak,
         n.rank_position,
         (b.rank_position - n.rank_position)::integer
  FROM now_rows n
  JOIN public.profiles p ON p.id = n.profile_id
  LEFT JOIN before_rows b ON b.profile_id = n.profile_id
  ORDER BY n.rank_position;
$$;

REVOKE ALL ON FUNCTION public.get_lol_standings(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lol_standings(integer, integer, integer) TO authenticated;
