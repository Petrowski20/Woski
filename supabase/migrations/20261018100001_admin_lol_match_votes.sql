-- ============================================================
--  Votos de una serie para la pestaña Predicciones del admin
--
--  admin_lol_match_participation solo dice si alguien ha votado.
--  Para corregir o cargar votos a mano (admin_set_lol_prediction)
--  el admin necesita ver QUÉ votó cada uno y cuándo, también con
--  la votación abierta, que la RLS de predictions oculta hasta el
--  cierre (predictions_lol_select_after_close).
--
--  Solo lectura. Comprueba el rol con lol_require_admin_actor()
--  (ADMIN identificado o sesión SQL; nunca service_role ni
--  usuarios normales). No calcula puntos: points_earned es el que
--  ya guardó el motor.
--
--  Filas: participantes de la edición (lol_edition_participants:
--  sin ocultos) y, además, cualquier usuario que tenga voto en la
--  serie aunque esté oculto (marcado con is_hidden), para que el
--  admin pueda verlo y corregirlo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_lol_match_votes(p_match_id integer)
RETURNS TABLE (
  profile_id     uuid,
  nickname       text,
  is_hidden      boolean,
  has_voted      boolean,
  pred_home      integer,
  pred_away      integer,
  pred_winner_id integer,
  saved_at       timestamptz,
  admin_entered  boolean,
  points_earned  integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_edition_id integer;
BEGIN
  PERFORM public.lol_require_admin_actor();
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'La serie % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;
  SELECT ph.edition_id INTO v_edition_id
  FROM public.matches m JOIN public.phases ph ON ph.id = m.phase_id
  WHERE m.id = p_match_id;

  RETURN QUERY
  WITH people AS (
    SELECT pp.profile_id FROM public.lol_edition_participants(v_edition_id) pp
    UNION
    SELECT pr.profile_id FROM public.predictions pr WHERE pr.match_id = p_match_id
  )
  SELECT p.id,
         p.nickname,
         p.is_hidden,
         pr.id IS NOT NULL,
         pr.pred_home_goals,
         pr.pred_away_goals,
         pr.pred_winner_id,
         pr.updated_at,
         COALESCE(pr.metadata ? 'admin_entered', false),
         pr.points_earned::integer
  FROM people
  JOIN public.profiles p          ON p.id = people.profile_id
  LEFT JOIN public.predictions pr ON pr.profile_id = p.id AND pr.match_id = p_match_id
  ORDER BY pr.id IS NULL, lower(p.nickname);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lol_match_votes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lol_match_votes(integer) TO authenticated;
