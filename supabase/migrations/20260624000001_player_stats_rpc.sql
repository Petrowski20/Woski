-- get_player_stats(): estadísticas de predicciones por jugador
--
-- Categoriza predicciones comparando los goles reales con los predichos,
-- en lugar de usar points_earned, para ser inmune al triple bonus (pts=4)
-- y a cualquier cambio futuro en la lógica de puntuación.
--
-- Categorías:
--   exact_scores : acertó los goles de ambos equipos exactamente
--   diff_scores  : acertó la diferencia pero no el marcador exacto
--   sign_scores  : acertó quién ganó/empató pero no la diferencia
--   misses       : falló el resultado

CREATE OR REPLACE FUNCTION get_player_stats()
RETURNS TABLE (
  profile_id   UUID,
  exact_scores BIGINT,
  diff_scores  BIGINT,
  sign_scores  BIGINT,
  misses       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pred.profile_id,
    COUNT(*) FILTER (
      WHERE pred.pred_home_goals = m.home_goals
        AND pred.pred_away_goals = m.away_goals
    ) AS exact_scores,
    COUNT(*) FILTER (
      WHERE NOT (pred.pred_home_goals = m.home_goals AND pred.pred_away_goals = m.away_goals)
        AND (pred.pred_home_goals - pred.pred_away_goals) = (m.home_goals - m.away_goals)
    ) AS diff_scores,
    COUNT(*) FILTER (
      WHERE (pred.pred_home_goals - pred.pred_away_goals) <> (m.home_goals - m.away_goals)
        AND SIGN(pred.pred_home_goals - pred.pred_away_goals) = SIGN(m.home_goals - m.away_goals)
    ) AS sign_scores,
    COUNT(*) FILTER (
      WHERE SIGN(pred.pred_home_goals - pred.pred_away_goals) <> SIGN(m.home_goals - m.away_goals)
    ) AS misses
  FROM predictions pred
  JOIN matches m ON m.id = pred.match_id
  WHERE m.status = 'FINISHED'
    AND m.home_goals IS NOT NULL
    AND m.away_goals IS NOT NULL
  GROUP BY pred.profile_id
$$;

REVOKE ALL ON FUNCTION get_player_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_player_stats() TO authenticated;
