-- ============================================================
--  PREDICTIONS — mover campos football-specific a metadata, añadir
--  columnas de aciertos puros (hechos objetivos, independientes del
--  Ruleset). No se recalcula points_earned.
-- ============================================================

ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS is_correct_winner boolean;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS is_correct_score boolean;

-- Backfill metadata
UPDATE public.predictions
SET metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
  'pred_advancing_team_id', pred_advancing_team_id
));

-- Backfill de aciertos puros, comparando contra el resultado real ya
-- guardado en matches. Solo se rellenan para partidos con resultado
-- (home_goals/away_goals no nulos); los pendientes quedan en NULL.
-- is_correct_winner usa el signo del marcador (1X2), un hecho objetivo
-- sobre el resultado en 90', independiente del Ruleset (que sí aplica
-- lógica adicional de "ganador absoluto" vía advancing_team_id).
UPDATE public.predictions pr
SET
  is_correct_score  = (pr.pred_home_goals = m.home_goals AND pr.pred_away_goals = m.away_goals),
  is_correct_winner = (SIGN(pr.pred_home_goals - pr.pred_away_goals) = SIGN(m.home_goals - m.away_goals))
FROM public.matches m
WHERE m.id = pr.match_id
  AND m.home_goals IS NOT NULL
  AND m.away_goals IS NOT NULL;

-- Tras confirmar la migración, se elimina pred_advancing_team_id.
-- pred_home_goals, pred_away_goals, pred_winner_id, points_earned se
-- mantienen sin cambios de nombre.
ALTER TABLE public.predictions
  DROP COLUMN IF EXISTS pred_advancing_team_id;
