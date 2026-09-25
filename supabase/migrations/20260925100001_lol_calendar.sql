-- ============================================================
--  LoL — calendario de partidos con votación
--  * teams.logo_url (identidad visual, válida para cualquier deporte)
--  * catálogo: sport "lol" + competiciones + ruleset por defecto
--  * RPC de distribución de votos (solo visible si ya has votado)
--  * RPC de ranking por edición (global o de un pool)
-- ============================================================

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS logo_url text;


-- ------------------------------------------------------------
--  Catálogo
-- ------------------------------------------------------------

INSERT INTO public.sports (slug, name)
VALUES ('lol', 'League of Legends')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.competitions (sport_id, slug, name)
SELECT s.id, c.slug, c.name
FROM public.sports s
CROSS JOIN (VALUES
  ('lec',    'LEC'),
  ('lcs',    'LCS'),
  ('msi',    'MSI'),
  ('worlds', 'Worlds')
) AS c(slug, name)
WHERE s.slug = 'lol'
ON CONFLICT (slug) DO NOTHING;

-- Puntuación de series:
--   exact_score_points     → aciertas el resultado exacto de la serie (p. ej. 3-1)
--   correct_winner_points  → aciertas solo quién gana la serie
-- default_best_of se usa si el partido no indica metadata.best_of.
INSERT INTO public.rulesets (name, config)
SELECT 'LoL Series (default)',
       '{
          "scoring_type": "series",
          "correct_winner_points": 1,
          "exact_score_points": 3,
          "default_best_of": 3
        }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.rulesets WHERE name = 'LoL Series (default)'
);


-- ------------------------------------------------------------
--  Distribución de votos por resultado.
--  Devuelve filas SOLO para los partidos en los que el usuario
--  que llama (auth.uid()) ya tiene una predicción guardada: la
--  regla "no ves los % hasta que votas" se aplica en la BD, no
--  solo en la interfaz.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_vote_distribution(p_match_ids integer[])
RETURNS TABLE (
  match_id        integer,
  pred_home_goals integer,
  pred_away_goals integer,
  votes           bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.match_id::integer,
         pr.pred_home_goals,
         pr.pred_away_goals,
         COUNT(*)::bigint
  FROM public.predictions pr
  WHERE pr.match_id = ANY (p_match_ids)
    AND EXISTS (
      SELECT 1
      FROM public.predictions mine
      WHERE mine.match_id = pr.match_id
        AND mine.profile_id = auth.uid()
    )
  GROUP BY pr.match_id, pr.pred_home_goals, pr.pred_away_goals;
$$;

REVOKE ALL ON FUNCTION public.get_my_vote_distribution(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_vote_distribution(integer[]) TO authenticated;


-- ------------------------------------------------------------
--  Ranking de una edición.
--  * p_pool_id NULL → todos los usuarios con al menos una
--    predicción en la edición.
--  * p_pool_id      → todos los miembros del pool (aunque no
--    hayan votado), siempre que el pool sea de esa edición.
--  Los puntos salen de predictions.points_earned de partidos
--  FINISHED de la edición (no usa profiles.total_points, que es
--  el acumulado del Mundial).
--  Desempate: puntos, resultados exactos, antigüedad de la cuenta.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_edition_ranking(
  p_edition_id integer,
  p_pool_id    integer DEFAULT NULL
)
RETURNS TABLE (
  profile_id        uuid,
  nickname          text,
  avatar_url        text,
  total_points      bigint,
  exact_scores      bigint,
  predictions_count bigint,
  rank_position     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scores AS (
    SELECT pr.profile_id AS pid,
           COALESCE(SUM(pr.points_earned) FILTER (WHERE m.status = 'FINISHED'), 0) AS pts,
           COUNT(*) FILTER (WHERE m.status = 'FINISHED' AND pr.is_correct_score)    AS exact,
           COUNT(*)                                                                  AS n_preds
    FROM public.predictions pr
    JOIN public.matches m  ON m.id  = pr.match_id
    JOIN public.phases  ph ON ph.id = m.phase_id
    WHERE ph.edition_id = p_edition_id
    GROUP BY pr.profile_id
  ),
  base AS (
    SELECT pm.profile_id AS pid
    FROM public.pool_members pm
    JOIN public.pools po ON po.id = pm.pool_id
    WHERE p_pool_id IS NOT NULL
      AND pm.pool_id = p_pool_id
      AND po.edition_id = p_edition_id
    UNION
    SELECT s.pid
    FROM scores s
    WHERE p_pool_id IS NULL
  )
  SELECT p.id,
         p.nickname,
         p.avatar_url,
         COALESCE(s.pts, 0)::bigint,
         COALESCE(s.exact, 0)::bigint,
         COALESCE(s.n_preds, 0)::bigint,
         ROW_NUMBER() OVER (
           ORDER BY COALESCE(s.pts, 0) DESC,
                    COALESCE(s.exact, 0) DESC,
                    p.created_at ASC
         )
  FROM base b
  JOIN public.profiles p ON p.id = b.pid
  LEFT JOIN scores s     ON s.pid = b.pid
  WHERE NOT p.is_hidden
  ORDER BY 7;
$$;

REVOKE ALL ON FUNCTION public.get_edition_ranking(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_edition_ranking(integer, integer) TO authenticated;
