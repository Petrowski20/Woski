-- ============================================================
--  LoL — reglas de jornada (sustituye a las de 20260925100003)
--
--  * Serie no votada = fallo: 0 puntos, igual que una serie votada
--    y fallada. Sin malus ni relleno por no votar.
--  * Jornada: series no canceladas de la edición que caen el mismo
--    día en la zona horaria de la sede (editions.timezone). Se aplica
--    en cualquier fase, liga o torneo de LoL, sea Bo1, Bo3 o Bo5.
--  * Las reglas de pleno solo se aplican a jornadas cerradas (todas
--    sus series FINISHED); los puntos de cada serie cuentan en cuanto
--    termina.
--  * Pleno positivo: aciertas el ganador (is_correct_winner) de TODAS
--    las series de la jornada (y por tanto las votaste todas).
--  * Pleno negativo: 0 aciertos sobre el total de series de la
--    jornada, sea porque fallaste las que votaste, porque no votaste,
--    o ambas cosas. Ejemplo: jornada de 5, votas 2 y fallas las 2, no
--    votas las otras 3 → 0 de 5 → pleno negativo. Mismo resultado que
--    votar las 5 y fallarlas.
--    Con al menos 1 acierto no hay pleno de ningún tipo.
--  * Los puntos de cada pleno salen del ruleset de la fase:
--      config.matchday.positive_perfect_points (por defecto 0:
--        solo informativo y desempate)
--      config.matchday.negative_perfect_points (por defecto -1)
--    Si una jornada mezcla fases con rulesets distintos, manda el de
--    la primera serie del día.
--  * Aciertos: ganadores acertados (las no votadas no suman).
--  * Racha: ganadores acertados seguidos hasta la última serie
--    terminada; no votar la corta. Mejor racha: la más larga dentro
--    de la fase en curso.
--  * Orden: puntos → plenos positivos → mejor racha de la fase →
--    antigüedad de la cuenta.
-- ============================================================

-- Valores explícitos en los rulesets de LoL que no los tengan.
UPDATE public.rulesets r
SET config = r.config || '{"matchday": {"positive_perfect_points": 0, "negative_perfect_points": -1}}'::jsonb
WHERE NOT r.config ? 'matchday'
  AND (
    r.name = 'LoL Series (default)'
    OR EXISTS (
      SELECT 1
      FROM public.phases       ph
      JOIN public.editions     e ON e.id = ph.edition_id
      JOIN public.competitions c ON c.id = e.competition_id
      JOIN public.sports       s ON s.id = c.sport_id
      WHERE ph.ruleset_id = r.id
        AND s.slug = 'lol'
    )
  );


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
SECURITY DEFINER
SET search_path = public
AS $$
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day,
           COALESCE((r.config -> 'matchday' ->> 'positive_perfect_points')::integer, 0)  AS positive_pts,
           COALESCE((r.config -> 'matchday' ->> 'negative_perfect_points')::integer, -1) AS negative_pts
    FROM public.matches mt
    JOIN public.phases        ph ON ph.id = mt.phase_id
    JOIN public.editions      e  ON e.id  = ph.edition_id
    LEFT JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE e.id = p_edition_id
      AND mt.status <> 'CANCELLED'
  ),
  in_range AS (
    SELECT * FROM edition_matches WHERE p_until IS NULL OR day <= p_until
  ),
  finished AS (
    SELECT * FROM in_range WHERE status = 'FINISHED'
  ),
  closed_days AS (
    SELECT day,
           COUNT(*)                                                 AS n_series,
           (ARRAY_AGG(positive_pts ORDER BY match_date, id))[1]    AS positive_pts,
           (ARRAY_AGG(negative_pts ORDER BY match_date, id))[1]    AS negative_pts
    FROM in_range
    GROUP BY day
    HAVING COUNT(*) = COUNT(*) FILTER (WHERE status = 'FINISHED')
  ),

  -- Quién aparece: Global = cualquiera con una predicción en la
  -- edición; pool = sus miembros (aunque no hayan votado).
  base AS (
    SELECT p.id AS pid, p.created_at
    FROM public.profiles p
    WHERE NOT p.is_hidden
      AND (
        (p_pool_id IS NULL AND EXISTS (
          SELECT 1
          FROM public.predictions pr
          JOIN edition_matches em ON em.id = pr.match_id
          WHERE pr.profile_id = p.id
        ))
        OR
        (p_pool_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.pool_members pm
          JOIN public.pools po ON po.id = pm.pool_id
          WHERE pm.pool_id = p_pool_id
            AND po.edition_id = p_edition_id
            AND pm.profile_id = p.id
        ))
      )
  ),

  -- Predicciones de los jugadores de la clasificación sobre series terminadas.
  preds AS (
    SELECT b.pid,
           f.id                                  AS match_id,
           f.day,
           COALESCE(pr.points_earned, 0)         AS pts,
           COALESCE(pr.is_correct_winner, false) AS ok
    FROM base b
    JOIN public.predictions pr ON pr.profile_id = b.pid
    JOIN finished f            ON f.id = pr.match_id
  ),
  series_points AS (
    SELECT pid,
           SUM(pts)                   AS pts,
           COUNT(*) FILTER (WHERE ok) AS correct
    FROM preds
    GROUP BY pid
  ),

  -- Plenos: cada jugador contra cada jornada cerrada, haya votado o no.
  player_days AS (
    SELECT b.pid,
           cd.n_series,
           cd.positive_pts,
           cd.negative_pts,
           COALESCE(h.hits, 0) AS hits
    FROM base b
    CROSS JOIN closed_days cd
    LEFT JOIN (
      SELECT pid, day, COUNT(*) FILTER (WHERE ok) AS hits
      FROM preds
      GROUP BY pid, day
    ) h ON h.pid = b.pid AND h.day = cd.day
  ),
  day_bonus AS (
    SELECT pid,
           COUNT(*) FILTER (WHERE hits = n_series) AS perfects,
           COUNT(*) FILTER (WHERE hits = 0)        AS negatives,
           SUM(CASE
                 WHEN hits = n_series THEN positive_pts
                 WHEN hits = 0        THEN negative_pts
                 ELSE 0
               END)                                AS pts
    FROM player_days
    GROUP BY pid
  ),

  -- Rachas: secuencia cronológica de series terminadas por jugador.
  seq AS (
    SELECT b.pid,
           f.id,
           f.phase_id,
           f.match_date,
           COALESCE(p.ok, false) AS ok,
           ROW_NUMBER() OVER (PARTITION BY b.pid ORDER BY f.match_date, f.id) AS rn
    FROM base b
    CROSS JOIN finished f
    LEFT JOIN preds p ON p.pid = b.pid AND p.match_id = f.id
  ),
  current_streak AS (
    SELECT pid, (MAX(rn) - COALESCE(MAX(rn) FILTER (WHERE NOT ok), 0))::integer AS streak
    FROM seq
    GROUP BY pid
  ),
  current_phase AS (
    SELECT phase_id FROM finished ORDER BY match_date DESC, id DESC LIMIT 1
  ),
  phase_runs AS (
    SELECT pid,
           ok,
           ROW_NUMBER() OVER (PARTITION BY pid ORDER BY match_date, id)
         - ROW_NUMBER() OVER (PARTITION BY pid, ok ORDER BY match_date, id) AS grp
    FROM seq
    WHERE phase_id = (SELECT phase_id FROM current_phase)
  ),
  best_streak AS (
    SELECT pid, MAX(len)::integer AS best
    FROM (SELECT pid, grp, COUNT(*) AS len FROM phase_runs WHERE ok GROUP BY pid, grp) r
    GROUP BY pid
  ),

  totals AS (
    SELECT b.pid,
           b.created_at,
           COALESCE(sp.pts, 0) + COALESCE(db.pts, 0) AS total_points,
           COALESCE(sp.correct, 0)                   AS correct_winners,
           (SELECT COUNT(*) FROM finished)           AS finished_series,
           COALESCE(db.perfects, 0)                  AS perfect_days,
           COALESCE(db.negatives, 0)                 AS negative_days,
           COALESCE(cs.streak, 0)                    AS current_streak,
           COALESCE(bs.best, 0)                      AS best_streak
    FROM base b
    LEFT JOIN series_points  sp ON sp.pid = b.pid
    LEFT JOIN day_bonus      db ON db.pid = b.pid
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

REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date) FROM PUBLIC, anon, authenticated;
