-- Recrea v_ranking_by_league con total_points (alias de league_points)
-- para que el frontend pueda usar el mismo campo que v_ranking_global.
-- Se elimina la columna position (el frontend la calcula con i+1).

DROP VIEW IF EXISTS v_ranking_by_league;

CREATE VIEW v_ranking_by_league AS
SELECT
  pl.league_id,
  lg.name          AS league_name,
  p.id             AS profile_id,
  p.nickname,
  pl.league_points AS total_points
FROM public.profile_leagues pl
JOIN public.profiles       p  ON p.id  = pl.profile_id
JOIN public.private_leagues lg ON lg.id = pl.league_id
ORDER BY pl.league_id, pl.league_points DESC;
