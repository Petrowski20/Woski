-- Recreate ranking views with tiebreaker support.
-- When total_points tie, order by:
--   1. exact_scores DESC   (marcador exacto, points_earned = 3)
--   2. correct_signs DESC  (ganador correcto sin diferencia, points_earned = 1)
--   3. goal_diff_sum ASC   (suma de |pred - real| goles en partidos terminados, menor = mejor)
--   4. created_at ASC      (orden de inscripción, antes = mejor)

DROP VIEW IF EXISTS v_ranking_by_league;
DROP VIEW IF EXISTS v_ranking_global;

CREATE VIEW v_ranking_global AS
WITH stats AS (
  SELECT
    pr.profile_id,
    COUNT(*) FILTER (WHERE pr.points_earned = 3 AND m.status = 'FINISHED')  AS exact_scores,
    COUNT(*) FILTER (WHERE pr.points_earned = 1 AND m.status = 'FINISHED')  AS correct_signs,
    COALESCE(SUM(
      ABS(pr.pred_home_goals - m.home_goals) + ABS(pr.pred_away_goals - m.away_goals)
    ) FILTER (WHERE m.status = 'FINISHED' AND m.home_goals IS NOT NULL), 0) AS goal_diff_sum
  FROM public.predictions pr
  JOIN public.matches m ON m.id = pr.match_id
  GROUP BY pr.profile_id
)
SELECT
  p.id                          AS profile_id,
  p.nickname,
  p.total_points,
  p.avatar_url,
  p.created_at,
  COALESCE(s.exact_scores,  0) AS exact_scores,
  COALESCE(s.correct_signs, 0) AS correct_signs,
  COALESCE(s.goal_diff_sum, 0) AS goal_diff_sum
FROM public.profiles p
LEFT JOIN stats s ON s.profile_id = p.id
ORDER BY
  p.total_points               DESC,
  COALESCE(s.exact_scores,  0) DESC,
  COALESCE(s.correct_signs, 0) DESC,
  COALESCE(s.goal_diff_sum, 0) ASC,
  p.created_at                 ASC;


CREATE VIEW v_ranking_by_league AS
WITH stats AS (
  SELECT
    pr.profile_id,
    COUNT(*) FILTER (WHERE pr.points_earned = 3 AND m.status = 'FINISHED')  AS exact_scores,
    COUNT(*) FILTER (WHERE pr.points_earned = 1 AND m.status = 'FINISHED')  AS correct_signs,
    COALESCE(SUM(
      ABS(pr.pred_home_goals - m.home_goals) + ABS(pr.pred_away_goals - m.away_goals)
    ) FILTER (WHERE m.status = 'FINISHED' AND m.home_goals IS NOT NULL), 0) AS goal_diff_sum
  FROM public.predictions pr
  JOIN public.matches m ON m.id = pr.match_id
  GROUP BY pr.profile_id
)
SELECT
  pl.league_id,
  lg.name              AS league_name,
  p.id                 AS profile_id,
  p.nickname,
  p.avatar_url,
  p.created_at,
  pl.league_points     AS total_points,
  COALESCE(s.exact_scores,  0) AS exact_scores,
  COALESCE(s.correct_signs, 0) AS correct_signs,
  COALESCE(s.goal_diff_sum, 0) AS goal_diff_sum
FROM public.profile_leagues pl
JOIN public.profiles        p   ON p.id  = pl.profile_id
JOIN public.private_leagues lg  ON lg.id = pl.league_id
LEFT JOIN stats             s   ON s.profile_id = p.id
ORDER BY
  pl.league_id,
  pl.league_points             DESC,
  COALESCE(s.exact_scores,  0) DESC,
  COALESCE(s.correct_signs, 0) DESC,
  COALESCE(s.goal_diff_sum, 0) ASC,
  p.created_at                 ASC;
