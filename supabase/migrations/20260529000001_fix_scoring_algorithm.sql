-- ============================================================
--  RPC: calculate_match_points (v2)
--  Algoritmo escalonado estricto: 1 (tendencia) → 2 (diferencia) → 3 (exacto)
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_match_points(
  p_match_id  SMALLINT,
  p_home_goals INTEGER,
  p_away_goals INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_sign INTEGER;  -- +1 | 0 | -1
  v_real_diff  INTEGER;
BEGIN
  v_match_sign := SIGN(p_home_goals - p_away_goals);
  v_real_diff  := p_home_goals - p_away_goals;

  -- 1. Fijar resultado y marcar partido como FINISHED
  UPDATE public.matches
  SET
    home_goals = p_home_goals,
    away_goals = p_away_goals,
    status     = 'FINISHED',
    updated_at = now()
  WHERE id = p_match_id;

  -- 2. Calcular points_earned con lógica escalonada:
  --    1 pt → acertó tendencia (ganador o empate)
  --    2 pts → acertó tendencia + diferencia de goles
  --    3 pts → acertó marcador exacto
  UPDATE public.predictions
  SET points_earned = (
    CASE
      WHEN SIGN(pred_home_goals - pred_away_goals) = v_match_sign THEN
        CASE
          WHEN (pred_home_goals - pred_away_goals) = v_real_diff THEN
            CASE
              WHEN pred_home_goals = p_home_goals AND pred_away_goals = p_away_goals
              THEN 3
              ELSE 2
            END
          ELSE 1
        END
      ELSE 0
    END
  )
  WHERE match_id = p_match_id;

  -- 3. Recalcular total_points en profiles para usuarios afectados
  UPDATE public.profiles p
  SET total_points = (
    SELECT COALESCE(SUM(pr.points_earned), 0)
    FROM public.predictions pr
    WHERE pr.profile_id = p.id
  )
  WHERE id IN (
    SELECT DISTINCT profile_id
    FROM public.predictions
    WHERE match_id = p_match_id
  );

  -- 4. Recalcular league_points en profile_leagues para usuarios afectados
  UPDATE public.profile_leagues pl
  SET league_points = (
    SELECT COALESCE(SUM(pr.points_earned), 0)
    FROM public.predictions pr
    WHERE pr.profile_id = pl.profile_id
  )
  WHERE pl.profile_id IN (
    SELECT DISTINCT profile_id
    FROM public.predictions
    WHERE match_id = p_match_id
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_match_points(SMALLINT, INTEGER, INTEGER) TO authenticated;
