-- ============================================================
--  LoL — % de votos visibles en cuanto votas
--  Solo cambia get_my_vote_distribution (20261013100001); no toca
--  tablas, RLS ni la lógica de puntos.
--
--  Antes el reparto de votos de una serie solo se devolvía con la
--  votación cerrada. Ahora también mientras está abierta, pero solo
--  a quien ya ha votado esa serie (auth.uid() con predicción en
--  ella). Se puede seguir cambiando el voto hasta el cierre: es una
--  decisión de producto aceptando que alguien se pase a la opción
--  minoritaria al ver el reparto.
--
--  Sigue siendo solo el agregado por marcador: los votos ajenos uno
--  a uno siguen ocultos hasta el cierre (RLS
--  predictions_lol_select_after_close). Los jugadores ocultos no
--  cuentan, como antes.
--  Misma firma y mismo RETURNS: CREATE OR REPLACE conserva los
--  permisos.
-- ============================================================

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
  JOIN public.profiles    p ON p.id = pr.profile_id AND NOT p.is_hidden
  WHERE pr.match_id = ANY (p_match_ids)
    AND auth.uid() IS NOT NULL
    AND public.is_lol_match(pr.match_id)
    AND (
      NOT public.lol_voting_open(pr.match_id)
      OR EXISTS (
        SELECT 1 FROM public.predictions mine
        WHERE mine.match_id = pr.match_id
          AND mine.profile_id = auth.uid()
      )
    )
  GROUP BY pr.match_id, pr.pred_home_goals, pr.pred_away_goals;
$$;

REVOKE ALL ON FUNCTION public.get_my_vote_distribution(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vote_distribution(integer[]) TO authenticated;
