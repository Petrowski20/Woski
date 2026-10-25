-- ============================================================
--  LoL — racha actual de la clasificación solo con la fase en
--  curso. Solo lol_standings_at: no cambia filas ni recalcula
--  puntos (los puntos no dependen de esta función).
--
--  Antes (20261021100001), en v2 la racha actual tomaba como corte
--  cualquier serie de otra fase. Si dos fases se solapan en fechas
--  (Grupo A y Grupo B alternando), la racha se reiniciaba en cada
--  cambio de fase, mientras que lol_score_breakdown (la que paga
--  los bonus) y best_streak cuentan solo las series de la propia
--  fase. Ejemplo, todo acertado y A/B alternando: el desglose da
--  1, 1, 2, 2, 3, 3; la clasificación mostraba actual 1, mejor 3.
--
--  Ahora, en v2, la racha actual se calcula solo con las
--  predicciones de la fase en curso (la de la última serie
--  terminada hasta la fecha de corte): último fallo de esa fase y
--  aciertos posteriores de esa fase. Las series de otras fases ni
--  suman ni cortan. v1 (racha de toda la edición) no cambia.
--  Con fases que no se solapan el resultado es el mismo que antes.
-- ============================================================


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte
--  Igual que 20261021100001 salvo last_reset/current_streak.
--  Misma firma y mismo RETURNS: CREATE OR REPLACE conserva los
--  permisos (nadie la ejecuta desde la API).
-- ------------------------------------------------------------

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
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day,
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
  in_range AS (
    SELECT * FROM edition_matches WHERE p_until IS NULL OR day <= p_until
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
    SELECT b.pid, ir.id, ir.status, ir.match_date, ir.phase_id, ir.day, ir.exact_counts, ir.exact_step
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

  totals AS (
    SELECT b.pid,
           b.created_at,
           COALESCE(o.pts, 0)                  AS total_points,
           COALESCE(h.correct, 0)              AS correct_winners,
           COALESCE(pl.n, 0)                   AS finished_series,
           COALESCE(o.perfects, 0)             AS perfect_days,
           COALESCE(o.negatives, 0)            AS negative_days,
           COALESCE(cs.streak, 0)              AS current_streak,
           COALESCE(bs.best, 0)                AS best_streak
    FROM base b
    LEFT JOIN own            o  ON o.pid  = b.pid
    LEFT JOIN hits           h  ON h.pid  = b.pid
    LEFT JOIN played         pl ON pl.pid = b.pid
    LEFT JOIN current_streak cs ON cs.pid = b.pid
    LEFT JOIN best_streak    bs ON bs.pid = b.pid
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
                    t.best_streak  DESC,
                    t.created_at   ASC
         )
  FROM totals t;
$$;

-- CREATE OR REPLACE conserva los permisos; se repite por claridad.
REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date) FROM PUBLIC, anon, authenticated;
