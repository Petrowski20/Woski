-- ============================================================
--  LoL — dar de alta series que ya se jugaron
--  Para series que se votaron por WhatsApp y no se apuntaron a
--  tiempo: admin_create_lol_match gana p_played (por defecto
--  false). Solo cambia esta función; no toca filas ni puntos.
--
--  * p_played = false: igual que antes (la votación tiene que
--    seguir abierta con esa hora).
--  * p_played = true: al revés, la votación tiene que estar YA
--    cerrada con esa hora (si sigue abierta es casi seguro una
--    fecha mal puesta: se rechaza y se crea como serie normal).
--    La serie queda PENDING y sin votos, como cualquier serie
--    empezada sin resultado: los votos se cargan con
--    admin_set_lol_prediction (auditado) y el resultado con
--    admin_set_lol_match_result, que puntúa desde esa serie.
--    No admite partido de la jornada: el trigger
--    trg_lol_matches_check_featured solo lo deja con la votación
--    abierta.
--  * Auditoría: la acción queda como 'create_played_match'.
--
--  Cambia la firma (8 argumentos): se borra la de 7 para que
--  PostgREST no tenga dos candidatas. Las llamadas posicionales
--  de 7 argumentos siguen valiendo (p_played tiene default).
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_create_lol_match(integer, text, text, timestamptz, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.admin_create_lol_match(
  p_phase_id   integer,
  p_home_tag   text,
  p_away_tag   text,
  p_match_date timestamptz,
  p_best_of    integer,
  p_featured   boolean DEFAULT false,
  p_reason     text    DEFAULT NULL,
  p_played     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    text := public.lol_require_admin_actor();
  v_played   boolean := COALESCE(p_played, false);
  v_home_id  integer;
  v_away_id  integer;
  v_match_id integer;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.phases       ph
    JOIN public.editions     e ON e.id = ph.edition_id
    JOIN public.competitions c ON c.id = e.competition_id
    JOIN public.sports       s ON s.id = c.sport_id
    WHERE ph.id = p_phase_id AND s.slug = 'lol'
  ) THEN
    RAISE EXCEPTION 'La fase % no existe o no es de LoL', p_phase_id USING ERRCODE = '22023';
  END IF;

  v_home_id := public.lol_team_by_tag(p_home_tag, 'A');
  v_away_id := public.lol_team_by_tag(p_away_tag, 'B');
  IF v_home_id = v_away_id THEN
    RAISE EXCEPTION 'El equipo A y el B son el mismo (%)', upper(btrim(p_home_tag)) USING ERRCODE = '22023';
  END IF;

  IF p_best_of IS NULL OR p_best_of NOT IN (1, 3, 5) THEN
    RAISE EXCEPTION 'El formato debe ser Bo1, Bo3 o Bo5 (recibido %)', COALESCE(p_best_of::text, 'nada') USING ERRCODE = '22023';
  END IF;

  IF p_match_date IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha y hora de inicio' USING ERRCODE = '22023';
  END IF;

  IF v_played AND p_featured THEN
    RAISE EXCEPTION 'Una serie ya jugada no puede ser partido de la jornada (solo se marca con la votación abierta)'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE phase_id = p_phase_id
      AND match_date = p_match_date
      AND status <> 'CANCELLED'
      AND ((home_team_id = v_home_id AND away_team_id = v_away_id)
        OR (home_team_id = v_away_id AND away_team_id = v_home_id))
  ) THEN
    RAISE EXCEPTION 'Ya existe % vs % a esa hora en esta fase', upper(btrim(p_home_tag)), upper(btrim(p_away_tag))
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE phase_id = p_phase_id
      AND status <> 'CANCELLED'
      AND ((home_team_id = v_home_id AND away_team_id = v_away_id)
        OR (home_team_id = v_away_id AND away_team_id = v_home_id))
  ) THEN
    v_warnings := v_warnings || to_jsonb(format(
      '%s y %s ya se cruzan en esta fase en otra fecha: se ha creado igualmente (revancha). Si era un cambio de hora, edita la serie existente y cancela esta.',
      upper(btrim(p_home_tag)), upper(btrim(p_away_tag))));
  END IF;

  INSERT INTO public.matches (home_team_id, away_team_id, match_date, status, phase_id, metadata)
  VALUES (v_home_id, v_away_id, p_match_date, 'PENDING', p_phase_id, jsonb_build_object('best_of', p_best_of))
  RETURNING id INTO v_match_id;

  IF v_played AND public.lol_voting_open(v_match_id) THEN
    RAISE EXCEPTION 'Con esa hora de inicio la votación aún estaría abierta: desmarca "ya jugada" o revisa la fecha.'
      USING ERRCODE = '22023';
  ELSIF NOT v_played AND NOT public.lol_voting_open(v_match_id) THEN
    RAISE EXCEPTION 'Con esa hora de inicio la votación ya estaría cerrada (corte de la fase: % min). Revisa la fecha o márcala como ya jugada.',
      public.lol_prediction_cutoff_minutes(v_match_id) USING ERRCODE = '22023';
  END IF;

  IF p_featured THEN
    UPDATE public.matches SET metadata = metadata || '{"featured_match": true}'::jsonb WHERE id = v_match_id;
  END IF;

  PERFORM public.lol_admin_log(v_actor, CASE WHEN v_played THEN 'create_played_match' ELSE 'create_match' END,
                               v_match_id, NULL, public.lol_match_snapshot(v_match_id), p_reason);
  RETURN jsonb_build_object('match_id', v_match_id, 'warnings', v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_lol_match(integer, text, text, timestamptz, integer, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_lol_match(integer, text, text, timestamptz, integer, boolean, text, boolean) TO authenticated;
