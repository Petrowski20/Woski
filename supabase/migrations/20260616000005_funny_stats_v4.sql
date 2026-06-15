-- ============================================================
--  RPC: get_funny_prediction_stats v4
--  Añade: worst_streak (racha más larga de fallos consecutivos)
-- ============================================================

DROP FUNCTION IF EXISTS get_funny_prediction_stats(INT);

CREATE OR REPLACE FUNCTION get_funny_prediction_stats(p_league_id INT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH detail AS (
    SELECT
      p.profile_id,
      pr.nickname,
      m.id                    AS match_id,
      m.stage::text,
      m.group_letter::text,
      m.match_date,
      t_home.name             AS home_team,
      t_home.flag_emoji       AS home_flag,
      t_home.iso_code         AS home_iso,
      t_home.fifa_ranking     AS home_ranking,
      t_home.confederation    AS home_confederation,
      t_away.name             AS away_team,
      t_away.flag_emoji       AS away_flag,
      t_away.iso_code         AS away_iso,
      t_away.fifa_ranking     AS away_ranking,
      t_away.confederation    AS away_confederation,
      p.pred_home_goals,
      p.pred_away_goals,
      m.home_goals            AS actual_home_goals,
      m.away_goals            AS actual_away_goals,
      p.points_earned,
      p.updated_at,
      ROUND(EXTRACT(EPOCH FROM (m.match_date - p.updated_at)) / 60)::int AS minutes_before_kickoff,
      CASE
        WHEN t_home.fifa_ranking IS NULL OR t_away.fifa_ranking IS NULL THEN false
        WHEN p.pred_home_goals > p.pred_away_goals
         AND t_home.fifa_ranking > t_away.fifa_ranking + 15 THEN true
        WHEN p.pred_away_goals > p.pred_home_goals
         AND t_away.fifa_ranking > t_home.fifa_ranking + 15 THEN true
        ELSE false
      END                     AS bet_on_underdog,
      (p.pred_home_goals + p.pred_away_goals) AS pred_total_goals,
      (ABS(p.pred_home_goals - m.home_goals) + ABS(p.pred_away_goals - m.away_goals)) AS goal_error,
      (ABS(p.pred_home_goals - m.home_goals) + ABS(p.pred_away_goals - m.away_goals) = 1
       AND p.points_earned < 3) AS missed_by_one,
      (p.pred_home_goals = p.pred_away_goals) AS predicted_draw
    FROM predictions p
    JOIN profiles pr  ON pr.id  = p.profile_id
    JOIN matches  m   ON m.id   = p.match_id
    JOIN teams t_home ON t_home.id = m.home_team_id
    JOIN teams t_away ON t_away.id = m.away_team_id
    WHERE m.status = 'FINISHED'
      AND (
        p_league_id IS NULL
        OR EXISTS (
          SELECT 1 FROM profile_leagues pl_f
          WHERE pl_f.profile_id = p.profile_id
            AND pl_f.league_id  = p_league_id
        )
      )
  ),

  -- ── Puntos acumulados partido a partido ───────────────────────────────────
  detail_with_cum AS (
    SELECT
      *,
      SUM(points_earned) OVER (
        PARTITION BY profile_id
        ORDER BY match_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::int AS cumulative_points
    FROM detail
  ),

  -- ── Rachas: patrón island-and-gaps ───────────────────────────────────────
  streak_calc AS (
    SELECT
      profile_id,
      match_date,
      (points_earned > 0)                                                            AS scored,
      ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY match_date)
        - ROW_NUMBER() OVER (PARTITION BY profile_id, (points_earned > 0) ORDER BY match_date) AS grp
    FROM detail
  ),
  streak_groups AS (
    SELECT
      profile_id,
      grp,
      scored,
      COUNT(*)::int    AS streak_len,
      MAX(match_date)  AS last_date
    FROM streak_calc
    GROUP BY profile_id, grp, scored
  ),
  last_group AS (
    SELECT DISTINCT ON (profile_id)
      profile_id,
      scored,
      streak_len
    FROM streak_groups
    ORDER BY profile_id, last_date DESC
  ),
  streak_summary AS (
    SELECT
      sg.profile_id,
      COALESCE(MAX(sg.streak_len) FILTER (WHERE     sg.scored), 0) AS best_streak,
      COALESCE(MAX(sg.streak_len) FILTER (WHERE NOT sg.scored), 0) AS worst_streak,
      COALESCE(CASE WHEN lg.scored THEN lg.streak_len ELSE 0 END, 0) AS current_streak
    FROM streak_groups sg
    JOIN last_group lg ON lg.profile_id = sg.profile_id
    GROUP BY sg.profile_id, lg.scored, lg.streak_len
  ),

  -- ── Rendimiento por confederación ─────────────────────────────────────────
  confederation_flat AS (
    SELECT profile_id, home_confederation AS confederation, points_earned, goal_error
    FROM detail
    WHERE home_confederation IS NOT NULL
    UNION ALL
    SELECT profile_id, away_confederation, points_earned, goal_error
    FROM detail
    WHERE away_confederation IS NOT NULL
      AND away_confederation IS DISTINCT FROM home_confederation
  ),
  confederation_stats AS (
    SELECT
      profile_id,
      confederation,
      COUNT(*)::int                                  AS matches,
      SUM(points_earned)::int                        AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_scores,
      ROUND(AVG(goal_error), 2)                      AS avg_goal_error
    FROM confederation_flat
    GROUP BY profile_id, confederation
  ),
  confederation_agg AS (
    SELECT
      profile_id,
      jsonb_agg(
        jsonb_build_object(
          'confederation',  confederation,
          'matches',        matches,
          'total_points',   total_points,
          'exact_scores',   exact_scores,
          'avg_goal_error', avg_goal_error
        ) ORDER BY total_points DESC
      ) AS by_confederation
    FROM confederation_stats
    GROUP BY profile_id
  ),

  -- ── Ligas del jugador ─────────────────────────────────────────────────────
  leagues_per_player AS (
    SELECT
      pl.profile_id,
      jsonb_agg(
        jsonb_build_object(
          'league_id',     pl.league_id,
          'league_name',   lg.name,
          'league_points', pl.league_points
        ) ORDER BY lg.name
      ) AS leagues
    FROM profile_leagues pl
    JOIN private_leagues lg ON lg.id = pl.league_id
    GROUP BY pl.profile_id
  ),

  -- ── Agregación principal ───────────────────────────────────────────────────
  agg AS (
    SELECT
      profile_id,
      nickname,
      COUNT(*)                                                        AS total_predictions,
      SUM(points_earned)                                              AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)                       AS exact_scores,
      COUNT(*) FILTER (WHERE points_earned = 2)                       AS diff_scores,
      COUNT(*) FILTER (WHERE points_earned = 1)                       AS correct_winners,
      COUNT(*) FILTER (WHERE points_earned = 0)                       AS wrong_predictions,
      COUNT(*) FILTER (WHERE bet_on_underdog)                         AS underdog_bets,
      COUNT(*) FILTER (WHERE bet_on_underdog AND points_earned > 0)   AS underdog_wins,
      SUM(pred_total_goals)                                           AS total_goals_predicted,
      ROUND(AVG(pred_total_goals), 2)                                 AS avg_goals_per_match,
      ROUND(AVG(minutes_before_kickoff), 0)::int                      AS avg_minutes_before_kickoff,
      COUNT(*) FILTER (WHERE minutes_before_kickoff BETWEEN 0 AND 5)  AS last_minute_count,
      COUNT(*) FILTER (WHERE minutes_before_kickoff < 0)              AS late_predictions,
      ROUND(AVG(goal_error), 2)                                       AS avg_goal_error,
      MAX(goal_error)                                                 AS max_goal_error,
      MAX(pred_total_goals)                                           AS max_pred_goals_in_match,
      COUNT(*) FILTER (WHERE missed_by_one)                           AS missed_by_one,
      COUNT(*) FILTER (WHERE predicted_draw)                          AS predicted_draws,
      jsonb_agg(
        jsonb_build_object(
          'match',                   home_team || ' vs ' || away_team,
          'home_flag',               home_flag,
          'away_flag',               away_flag,
          'home_iso',                home_iso,
          'away_iso',                away_iso,
          'stage',                   stage,
          'group_letter',            group_letter,
          'home_ranking',            home_ranking,
          'away_ranking',            away_ranking,
          'home_confederation',      home_confederation,
          'away_confederation',      away_confederation,
          'pred_result',             pred_home_goals::text || '-' || pred_away_goals::text,
          'actual_result',           actual_home_goals::text || '-' || actual_away_goals::text,
          'points_earned',           points_earned,
          'cumulative_points',       cumulative_points,
          'minutes_before_kickoff',  minutes_before_kickoff,
          'bet_on_underdog',         bet_on_underdog,
          'pred_total_goals',        pred_total_goals,
          'goal_error',              goal_error,
          'missed_by_one',           missed_by_one,
          'predicted_draw',          predicted_draw
        ) ORDER BY match_date
      ) AS predictions
    FROM detail_with_cum
    GROUP BY profile_id, nickname
  )

  SELECT jsonb_agg(
    jsonb_build_object(
      'profile_id',                  a.profile_id,
      'nickname',                    a.nickname,
      'leagues',                     COALESCE(lp.leagues,         '[]'::jsonb),
      'total_predictions',           a.total_predictions,
      'total_points',                a.total_points,
      'exact_scores',                a.exact_scores,
      'diff_scores',                 a.diff_scores,
      'correct_winners',             a.correct_winners,
      'wrong_predictions',           a.wrong_predictions,
      'underdog_bets',               a.underdog_bets,
      'underdog_wins',               a.underdog_wins,
      'total_goals_predicted',       a.total_goals_predicted,
      'avg_goals_per_match',         a.avg_goals_per_match,
      'avg_minutes_before_kickoff',  a.avg_minutes_before_kickoff,
      'last_minute_count',           a.last_minute_count,
      'late_predictions',            a.late_predictions,
      'avg_goal_error',              a.avg_goal_error,
      'max_goal_error',              a.max_goal_error,
      'max_pred_goals_in_match',     a.max_pred_goals_in_match,
      'missed_by_one',               a.missed_by_one,
      'predicted_draws',             a.predicted_draws,
      'best_streak',                 COALESCE(ss.best_streak,    0),
      'worst_streak',                COALESCE(ss.worst_streak,   0),
      'current_streak',              COALESCE(ss.current_streak, 0),
      'by_confederation',            COALESCE(ca.by_confederation,'[]'::jsonb),
      'predictions',                 a.predictions
    ) ORDER BY a.total_points DESC
  ) INTO v_result
  FROM agg a
  LEFT JOIN leagues_per_player lp ON lp.profile_id = a.profile_id
  LEFT JOIN streak_summary     ss ON ss.profile_id  = a.profile_id
  LEFT JOIN confederation_agg  ca ON ca.profile_id  = a.profile_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_funny_prediction_stats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_funny_prediction_stats(INT) TO authenticated;
