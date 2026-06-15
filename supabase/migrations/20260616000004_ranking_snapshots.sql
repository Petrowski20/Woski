-- ============================================================
--  Historial de posiciones en la clasificación
--
--  ranking_snapshots: una fila por (partido, jugador, scope)
--    league_id NULL  → ranking global
--    league_id NOT NULL → ranking de esa liga privada
--
--  Se rellena llamando a record_ranking_snapshot(match_id)
--  justo después de calculate_match_points.
--
--  get_ranking_movement(league_id) devuelve para cada jugador
--  su posición actual, la anterior y el delta (+ = subió).
-- ============================================================

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  match_id     SMALLINT NOT NULL REFERENCES matches(id)         ON DELETE CASCADE,
  profile_id   UUID     NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  league_id    INTEGER           REFERENCES private_leagues(id) ON DELETE CASCADE,
  rank         SMALLINT NOT NULL,
  total_points SMALLINT NOT NULL,
  snapshot_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices únicos parciales para manejar league_id nullable limpiamente
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshots_global
  ON ranking_snapshots (match_id, profile_id)
  WHERE league_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshots_league
  ON ranking_snapshots (match_id, profile_id, league_id)
  WHERE league_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_profile_match
  ON ranking_snapshots (profile_id, match_id DESC);


-- ============================================================
--  record_ranking_snapshot(p_match_id)
--  Congela el ranking actual justo después de calcular puntos.
--  ON CONFLICT DO NOTHING → idempotente (re-ejecutar es seguro).
-- ============================================================

CREATE OR REPLACE FUNCTION record_ranking_snapshot(p_match_id SMALLINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Snapshot global
  INSERT INTO ranking_snapshots (match_id, profile_id, league_id, rank, total_points)
  SELECT
    p_match_id,
    profile_id,
    NULL::integer,
    ROW_NUMBER() OVER (
      ORDER BY
        total_points  DESC,
        exact_scores  DESC,
        correct_signs DESC,
        goal_diff_sum ASC,
        created_at    ASC
    )::smallint,
    total_points::smallint
  FROM v_ranking_global
  ON CONFLICT DO NOTHING;

  -- Snapshot por liga
  INSERT INTO ranking_snapshots (match_id, profile_id, league_id, rank, total_points)
  SELECT
    p_match_id,
    profile_id,
    league_id,
    ROW_NUMBER() OVER (
      PARTITION BY league_id
      ORDER BY
        total_points  DESC,
        exact_scores  DESC,
        correct_signs DESC,
        goal_diff_sum ASC,
        created_at    ASC
    )::smallint,
    total_points::smallint
  FROM v_ranking_by_league
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_ranking_snapshot(SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_ranking_snapshot(SMALLINT) TO authenticated;


-- ============================================================
--  get_ranking_movement(p_league_id)
--  Devuelve para cada jugador:
--    current_rank   – posición en el snapshot más reciente
--    previous_rank  – posición en el snapshot anterior
--    movement       – previous - current  (positivo = subió, negativo = bajó)
-- ============================================================

CREATE OR REPLACE FUNCTION get_ranking_movement(p_league_id INT DEFAULT NULL)
RETURNS TABLE (
  profile_id    UUID,
  current_rank  INT,
  previous_rank INT,
  movement      INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH numbered AS (
    SELECT
      profile_id,
      rank,
      ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY match_id DESC) AS rn
    FROM ranking_snapshots
    WHERE (p_league_id IS NULL     AND league_id IS NULL)
       OR (p_league_id IS NOT NULL AND league_id = p_league_id)
  )
  SELECT
    profile_id::uuid,
    MAX(rank) FILTER (WHERE rn = 1)::int                                      AS current_rank,
    MAX(rank) FILTER (WHERE rn = 2)::int                                      AS previous_rank,
    (MAX(rank) FILTER (WHERE rn = 2) - MAX(rank) FILTER (WHERE rn = 1))::int AS movement
  FROM numbered
  WHERE rn <= 2
  GROUP BY profile_id
$$;

REVOKE ALL ON FUNCTION get_ranking_movement(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ranking_movement(INT) TO authenticated;
