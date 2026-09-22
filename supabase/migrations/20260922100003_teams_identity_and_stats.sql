-- ============================================================
--  TEAMS — separar identidad de estadísticas por edición
-- ============================================================

-- Defensivo: manager_nationality se referencia hoy desde el frontend
-- (app/(main)/selecciones/page.tsx) pero no existe migración previa que
-- la cree en este repo — probablemente se añadió manualmente en
-- producción (mismo patrón que 20260716000002_drop_matchday.sql).
-- Se asegura su existencia antes de migrarla para no perder datos.
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS manager_nationality text;

ALTER TABLE public.teams RENAME COLUMN group_letter TO group_letter_old;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sport_id integer REFERENCES public.sports(id);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS slug text;

CREATE TABLE public.team_edition_stats (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition_id         integer NOT NULL REFERENCES public.editions(id),
  team_id            integer NOT NULL REFERENCES public.teams(id),
  group_letter       text,
  matches_played     smallint DEFAULT 0,
  wins               smallint DEFAULT 0,
  draws              smallint DEFAULT 0,
  losses             smallint DEFAULT 0,
  goals_for          smallint DEFAULT 0,
  goals_against      smallint DEFAULT 0,
  points             smallint DEFAULT 0,
  goal_difference    integer,
  is_eliminated      boolean DEFAULT false,
  fifa_ranking       smallint,
  manager            text,
  confederation      text,
  world_cups_won     smallint DEFAULT 0,
  last_wc_result     text,
  seudonimo          text,
  manager_nationality text
);

ALTER TABLE public.team_edition_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_edition_stats_select_all"
  ON public.team_edition_stats FOR SELECT USING (true);

-- Backfill: identidad
UPDATE public.teams
SET sport_id = (SELECT id FROM public.sports WHERE slug = 'football')
WHERE sport_id IS NULL;

UPDATE public.teams
SET slug = lower(iso_code)
WHERE slug IS NULL;

ALTER TABLE public.teams ADD CONSTRAINT teams_slug_key UNIQUE (slug);

-- Backfill: estadísticas por edición (Mundial 2026)
INSERT INTO public.team_edition_stats (
  edition_id, team_id, group_letter, matches_played, wins, draws, losses,
  goals_for, goals_against, points, goal_difference, is_eliminated,
  fifa_ranking, manager, confederation, world_cups_won, last_wc_result,
  seudonimo, manager_nationality
)
SELECT
  (SELECT ed.id
     FROM public.editions ed
     JOIN public.competitions c ON c.id = ed.competition_id
    WHERE c.slug = 'fifa-world-cup'),
  t.id, t.group_letter_old::text, t.matches_played, t.wins, t.draws, t.losses,
  t.goals_for, t.goals_against, t.points, t.goal_difference, t.is_eliminated,
  t.fifa_ranking, t.manager, t.confederation, t.world_cups_won, t.last_wc_result,
  t.seudonimo, t.manager_nationality
FROM public.teams t;

-- Tras confirmar que los datos ya viven en team_edition_stats, se
-- eliminan de teams las columnas ya migradas. teams se queda solo con
-- identidad: id, sport_id, slug, name, iso_code, flag_emoji.
ALTER TABLE public.teams
  DROP COLUMN IF EXISTS goal_difference,
  DROP COLUMN IF EXISTS matches_played,
  DROP COLUMN IF EXISTS wins,
  DROP COLUMN IF EXISTS draws,
  DROP COLUMN IF EXISTS losses,
  DROP COLUMN IF EXISTS goals_for,
  DROP COLUMN IF EXISTS goals_against,
  DROP COLUMN IF EXISTS points,
  DROP COLUMN IF EXISTS is_eliminated,
  DROP COLUMN IF EXISTS fifa_ranking,
  DROP COLUMN IF EXISTS manager,
  DROP COLUMN IF EXISTS confederation,
  DROP COLUMN IF EXISTS world_cups_won,
  DROP COLUMN IF EXISTS last_wc_result,
  DROP COLUMN IF EXISTS seudonimo,
  DROP COLUMN IF EXISTS manager_nationality,
  DROP COLUMN IF EXISTS group_letter_old;
