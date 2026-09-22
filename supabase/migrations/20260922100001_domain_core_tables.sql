-- ============================================================
--  DOMAIN MODEL — tablas genéricas de dominio
--  (docs/01-architecture/domain-model.md, ADR-001, ADR-002)
-- ============================================================

CREATE TABLE public.sports (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE public.competitions (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_id  integer NOT NULL REFERENCES public.sports(id),
  slug      text NOT NULL UNIQUE,
  name      text NOT NULL
);

CREATE TABLE public.editions (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id integer NOT NULL REFERENCES public.competitions(id),
  name           text NOT NULL,
  start_date     date,
  end_date       date
);

CREATE TABLE public.rulesets (
  id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name   text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.phases (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition_id  integer NOT NULL REFERENCES public.editions(id),
  ruleset_id  integer NOT NULL REFERENCES public.rulesets(id),
  name        text NOT NULL,
  "order"     smallint NOT NULL DEFAULT 0
);

ALTER TABLE public.sports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rulesets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sports_select_all"       ON public.sports       FOR SELECT USING (true);
CREATE POLICY "competitions_select_all" ON public.competitions FOR SELECT USING (true);
CREATE POLICY "editions_select_all"     ON public.editions     FOR SELECT USING (true);
CREATE POLICY "rulesets_select_all"     ON public.rulesets     FOR SELECT USING (true);
CREATE POLICY "phases_select_all"       ON public.phases       FOR SELECT USING (true);


-- ============================================================
--  SEED — Football / FIFA World Cup / 2026
--  Ruleset config replica la lógica real de calculate_match_points
--  (ver 20260602000003_fix_absolute_winner.sql), no se reinventa.
-- ============================================================

INSERT INTO public.sports (slug, name)
VALUES ('football', 'Football');

INSERT INTO public.competitions (sport_id, slug, name)
SELECT s.id, 'fifa-world-cup', 'FIFA World Cup'
FROM public.sports s
WHERE s.slug = 'football';

INSERT INTO public.editions (competition_id, name)
SELECT c.id, '2026'
FROM public.competitions c
WHERE c.slug = 'fifa-world-cup';

-- Fechas de la edición derivadas de los partidos ya cargados (si existen).
UPDATE public.editions ed
SET
  start_date = sub.min_date,
  end_date   = sub.max_date
FROM (
  SELECT MIN(match_date)::date AS min_date, MAX(match_date)::date AS max_date
  FROM public.matches
) sub
WHERE ed.competition_id = (SELECT id FROM public.competitions WHERE slug = 'fifa-world-cup')
  AND sub.min_date IS NOT NULL;

INSERT INTO public.rulesets (name, config)
VALUES (
  'Football Classic (World Cup 2026)',
  '{
     "scoring_type": "tiered",
     "group_stage": {
       "correct_winner_points": 1,
       "correct_goal_difference_points": 2,
       "exact_score_points": 3
     },
     "knockout_stage": {
       "wrong_advancing_team_points": 0,
       "correct_advancing_team_points": 1,
       "correct_advancing_team_and_goal_difference_points": 2,
       "correct_advancing_team_and_exact_score_points": 3
     }
   }'::jsonb
);

-- Una fase por cada valor del enum match_stage existente, en orden de torneo.
INSERT INTO public.phases (edition_id, ruleset_id, name, "order")
SELECT ed.id, r.id, s.stage_name, s.ord
FROM (VALUES
  ('GROUP',         0),
  ('ROUND_OF_32',   1),
  ('ROUND_OF_16',   2),
  ('QUARTER_FINAL', 3),
  ('SEMI_FINAL',    4),
  ('THIRD_PLACE',   5),
  ('FINAL',         6)
) AS s(stage_name, ord)
CROSS JOIN (
  SELECT ed.id
  FROM public.editions ed
  JOIN public.competitions c ON c.id = ed.competition_id
  WHERE c.slug = 'fifa-world-cup'
) ed
CROSS JOIN (
  SELECT id FROM public.rulesets WHERE name = 'Football Classic (World Cup 2026)'
) r;
