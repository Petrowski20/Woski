-- ============================================================
--  LoL — clasificación por edición
--  * editions.timezone: zona horaria de la sede, para agrupar
--    las series en jornadas (día natural en la sede, no en
--    Madrid: una serie a las 21:00 y otra a la 01:00 de Madrid
--    pueden ser la misma jornada en América).
--  * lol_standings_at(): clasificación a una fecha de corte.
--  * get_lol_standings(): clasificación actual + movimiento
--    respecto a la jornada anterior.
--
--  Reglas (todas sobre series no canceladas de la edición):
--  * Jornada cerrada: día de la sede en el que todas sus series
--    están FINISHED. Plenos y "no votar" solo se aplican a
--    jornadas cerradas; los puntos de series ya terminadas de una
--    jornada abierta cuentan desde el primer momento.
--  * Pleno positivo: votó todas las series de la jornada y acertó
--    el ganador (is_correct_winner) de todas.
--  * Pleno negativo: votó todas y falló todas. Resta 1 punto.
--  * No votar ninguna serie de una jornada cerrada: recibe la
--    puntuación del peor de esa jornada (entre todos los que
--    votaron alguna serie, no solo los del pool, para que tu
--    total sea el mismo en Global y en cualquier pool). Si ese
--    peor resultado fue un pleno negativo, también se le cuenta
--    un pleno negativo (el -1 ya va dentro de esa puntuación).
--    Votar solo parte de la jornada no activa esta regla: suma lo
--    que haya acertado y no puede hacer pleno.
--  * Aciertos: ganadores acertados / series terminadas de la
--    edición (las no votadas cuentan como no acertadas).
--  * Racha: ganadores acertados seguidos hasta la última serie
--    terminada; no votar la corta. Mejor racha: la más larga
--    dentro de la fase en curso (la de la última serie terminada).
--  * Orden: puntos → plenos positivos → mejor racha de la fase →
--    antigüedad de la cuenta.
-- ============================================================

ALTER TABLE public.editions
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Madrid';

COMMENT ON COLUMN public.editions.timezone IS
  'Zona horaria IANA de la sede. Define qué series forman una misma jornada.';

UPDATE public.editions e
SET timezone = CASE c.slug
  WHEN 'lec' THEN 'Europe/Berlin'
  WHEN 'lcs' THEN 'America/Los_Angeles'
END
FROM public.competitions c
WHERE c.id = e.competition_id
  AND c.slug IN ('lec', 'lcs');


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte (jornada de la sede).
--  p_until NULL → sin corte (estado actual).
--  Uso interno: la expone get_lol_standings.
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
SECURITY DEFINER
SET search_path = public
AS $$
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day
    FROM public.matches mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
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
    SELECT day, COUNT(*) AS n_series
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

  -- Predicciones sobre series terminadas (de todos los jugadores
  -- visibles: el peor de la jornada se busca entre todos).
  preds AS (
    SELECT pr.profile_id AS pid,
           f.id          AS match_id,
           f.day,
           COALESCE(pr.points_earned, 0)         AS pts,
           COALESCE(pr.is_correct_winner, false) AS ok
    FROM finished f
    JOIN public.predictions pr ON pr.match_id = f.id
    JOIN public.profiles    p  ON p.id = pr.profile_id AND NOT p.is_hidden
  ),
  voter_days AS (
    SELECT d.pid,
           d.day,
           cd.day IS NOT NULL AS closed,
           (cd.day IS NOT NULL AND d.voted = cd.n_series AND d.hits = cd.n_series) AS perfect,
           (cd.day IS NOT NULL AND d.voted = cd.n_series AND d.hits = 0)           AS negative,
           d.pts
    FROM (
      SELECT pid, day, SUM(pts) AS pts, COUNT(*) AS voted, COUNT(*) FILTER (WHERE ok) AS hits
      FROM preds
      GROUP BY pid, day
    ) d
    LEFT JOIN closed_days cd ON cd.day = d.day
  ),
  day_scores AS (
    SELECT vd.*, vd.pts - CASE WHEN vd.negative THEN 1 ELSE 0 END AS score
    FROM voter_days vd
  ),
  day_floor AS (
    SELECT w.day,
           w.min_score,
           EXISTS (
             SELECT 1 FROM day_scores s
             WHERE s.day = w.day AND s.closed AND s.score = w.min_score AND s.negative
           ) AS floor_negative
    FROM (
      SELECT day, MIN(score) AS min_score
      FROM day_scores
      WHERE closed
      GROUP BY day
    ) w
  ),
  missed AS (
    SELECT b.pid,
           SUM(fl.min_score)                            AS pts,
           COUNT(*) FILTER (WHERE fl.floor_negative)    AS negatives
    FROM base b
    CROSS JOIN day_floor fl
    WHERE NOT EXISTS (
      SELECT 1 FROM voter_days vd WHERE vd.pid = b.pid AND vd.day = fl.day
    )
    GROUP BY b.pid
  ),
  own AS (
    SELECT pid,
           SUM(score)                          AS pts,
           COUNT(*) FILTER (WHERE perfect)     AS perfects,
           COUNT(*) FILTER (WHERE negative)    AS negatives
    FROM day_scores
    GROUP BY pid
  ),
  hits AS (
    SELECT pid, COUNT(*) FILTER (WHERE ok) AS correct
    FROM preds
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
           COALESCE(o.pts, 0) + COALESCE(m.pts, 0)             AS total_points,
           COALESCE(h.correct, 0)                              AS correct_winners,
           (SELECT COUNT(*) FROM finished)                     AS finished_series,
           COALESCE(o.perfects, 0)                             AS perfect_days,
           COALESCE(o.negatives, 0) + COALESCE(m.negatives, 0) AS negative_days,
           COALESCE(cs.streak, 0)                              AS current_streak,
           COALESCE(bs.best, 0)                                AS best_streak
    FROM base b
    LEFT JOIN own            o  ON o.pid  = b.pid
    LEFT JOIN missed         m  ON m.pid  = b.pid
    LEFT JOIN hits           h  ON h.pid  = b.pid
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


-- ------------------------------------------------------------
--  Clasificación actual de una edición (global o de un pool),
--  con el movimiento respecto al final de la jornada anterior
--  (+ = sube). movement NULL si todavía no hay jornada anterior.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_lol_standings(
  p_edition_id integer,
  p_pool_id    integer DEFAULT NULL
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
      AND mt.status = 'FINISHED'
  ),
  previous_day AS (
    SELECT MAX(day) AS day
    FROM finished_days
    WHERE day < (SELECT MAX(day) FROM finished_days)
  ),
  now_rows AS (
    SELECT * FROM public.lol_standings_at(p_edition_id, p_pool_id, NULL)
  ),
  before_rows AS (
    SELECT s.profile_id, s.rank_position
    FROM previous_day pd
    CROSS JOIN LATERAL public.lol_standings_at(p_edition_id, p_pool_id, pd.day) s
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

REVOKE ALL ON FUNCTION public.get_lol_standings(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lol_standings(integer, integer) TO authenticated;
