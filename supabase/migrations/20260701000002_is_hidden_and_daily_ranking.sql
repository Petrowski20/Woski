-- ============================================================
--  1. Ocultar jugadores de la clasificación pública
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
--  2. Actualizar vistas para excluir jugadores ocultos
-- ============================================================

DROP VIEW IF EXISTS v_ranking_global;
CREATE VIEW v_ranking_global AS
SELECT
  p.id          AS profile_id,
  p.nickname,
  p.total_points,
  p.avatar_url,
  p.created_at
FROM public.profiles p
WHERE NOT p.is_hidden
ORDER BY p.total_points DESC, p.created_at ASC;

DROP VIEW IF EXISTS v_ranking_by_league;
CREATE VIEW v_ranking_by_league AS
SELECT
  pl.league_id,
  lg.name          AS league_name,
  p.id             AS profile_id,
  p.nickname,
  p.avatar_url,
  pl.league_points AS total_points,
  p.created_at
FROM public.profile_leagues pl
JOIN public.profiles        p  ON p.id  = pl.profile_id
JOIN public.private_leagues lg ON lg.id = pl.league_id
WHERE NOT p.is_hidden
ORDER BY pl.league_id, pl.league_points DESC, p.created_at ASC;

-- ============================================================
--  3. RPC para el admin: ranking completo + puntos del último día
--     Incluye jugadores ocultos para que el admin pueda gestionarlos.
--
--     El "día" se calcula con la hora local de la sede (America/Mexico_City,
--     referencia del Mundial 2026) y no en UTC: los partidos de tarde/noche
--     allí caen en UTC del día siguiente, lo que partiría en dos una misma
--     jornada si agrupáramos por fecha UTC.
-- ============================================================

CREATE OR REPLACE FUNCTION get_admin_player_ranking()
RETURNS TABLE (
  profile_id   UUID,
  nickname     TEXT,
  avatar_url   TEXT,
  total_points INTEGER,
  is_hidden    BOOLEAN,
  day_points   BIGINT,
  match_day    DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_finished_day AS (
    SELECT DATE(match_date AT TIME ZONE 'America/Mexico_City') AS day_date
    FROM matches
    WHERE status = 'FINISHED'
    ORDER BY match_date DESC
    LIMIT 1
  ),
  daily AS (
    SELECT
      pr.profile_id,
      COALESCE(SUM(pr.points_earned), 0) AS day_points
    FROM predictions pr
    JOIN matches m ON m.id = pr.match_id
    WHERE DATE(m.match_date AT TIME ZONE 'America/Mexico_City') = (SELECT day_date FROM last_finished_day)
      AND m.status = 'FINISHED'
    GROUP BY pr.profile_id
  )
  SELECT
    p.id             AS profile_id,
    p.nickname,
    p.avatar_url,
    p.total_points,
    p.is_hidden,
    COALESCE(d.day_points, 0) AS day_points,
    (SELECT day_date FROM last_finished_day) AS match_day
  FROM profiles p
  LEFT JOIN daily d ON d.profile_id = p.id
  ORDER BY p.total_points DESC
$$;

REVOKE ALL ON FUNCTION get_admin_player_ranking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_player_ranking() TO authenticated;

-- ============================================================
--  4. RPC para premios: top jugadores del último día (solo visibles)
-- ============================================================

CREATE OR REPLACE FUNCTION get_daily_mvp(p_limit INT DEFAULT 5)
RETURNS TABLE (
  profile_id UUID,
  nickname   TEXT,
  day_points BIGINT,
  match_day  DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_finished_day AS (
    SELECT DATE(match_date AT TIME ZONE 'America/Mexico_City') AS day_date
    FROM matches
    WHERE status = 'FINISHED'
    ORDER BY match_date DESC
    LIMIT 1
  ),
  daily AS (
    SELECT
      pr.profile_id,
      SUM(pr.points_earned) AS day_points
    FROM predictions pr
    JOIN matches m ON m.id = pr.match_id
    WHERE DATE(m.match_date AT TIME ZONE 'America/Mexico_City') = (SELECT day_date FROM last_finished_day)
      AND m.status = 'FINISHED'
    GROUP BY pr.profile_id
    HAVING SUM(pr.points_earned) > 0
  )
  SELECT
    p.id       AS profile_id,
    p.nickname,
    d.day_points,
    (SELECT day_date FROM last_finished_day) AS match_day
  FROM profiles p
  JOIN daily d ON d.profile_id = p.id
  WHERE NOT p.is_hidden
  ORDER BY d.day_points DESC
  LIMIT p_limit
$$;

REVOKE ALL ON FUNCTION get_daily_mvp(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_daily_mvp(INT) TO authenticated;
