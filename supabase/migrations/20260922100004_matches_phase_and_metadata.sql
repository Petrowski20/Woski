-- ============================================================
--  MATCHES — sustituir stage fijo por phase_id, mover campos
--  football-specific (stadium, referee, advancing_team_id) a metadata
-- ============================================================

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase_id integer REFERENCES public.phases(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill metadata (solo incluye claves con valor, vía jsonb_strip_nulls)
UPDATE public.matches
SET metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
  'stadium', stadium,
  'referee', referee,
  'advancing_team_id', advancing_team_id
));

-- Backfill phase_id: stage + group_letter -> phase correspondiente ya
-- creada en 20260922100001 (una fase por cada valor de match_stage).
UPDATE public.matches m
SET phase_id = ph.id
FROM public.phases ph
JOIN public.editions ed ON ed.id = ph.edition_id
JOIN public.competitions c ON c.id = ed.competition_id
WHERE c.slug = 'fifa-world-cup'
  AND ph.name = m.stage::text;

-- Constraint/índice que dependen de las columnas a eliminar (se dropean
-- explícitamente en vez de confiar en el drop implícito de Postgres).
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS chk_group_letter_only_in_groups;
DROP INDEX IF EXISTS public.idx_matches_stage;

-- Tras confirmar la migración, se eliminan de matches las columnas ya
-- migradas a phase_id/metadata. home_team_id, away_team_id, match_date,
-- status, home_goals, away_goals, winner_id se mantienen sin cambios.
ALTER TABLE public.matches
  DROP COLUMN IF EXISTS stadium,
  DROP COLUMN IF EXISTS referee,
  DROP COLUMN IF EXISTS advancing_team_id,
  DROP COLUMN IF EXISTS stage,
  DROP COLUMN IF EXISTS group_letter;
