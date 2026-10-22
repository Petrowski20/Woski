-- ============================================================
--  LoL — seed de cada equipo por edición ("LCK #1")
--  No toca puntuación ni filas existentes.
--
--  * team_edition_stats.league (sigla de la liga de origen: LCK,
--    LPL, LEC, LTA…) y team_edition_stats.seed (1–16). Las dos o
--    ninguna. La tabla ya relaciona equipo y edición y ya se lee en
--    público (team_edition_stats_select_all).
--  * admin_set_lol_team_seed: pone, cambia o quita (NULL, NULL) el
--    seed de un equipo de LoL en una edición de LoL. SECURITY
--    DEFINER, ADMIN con lol_require_admin_actor() (también el SQL
--    Editor), deja registro en lol_admin_audit (set_team_seed).
--    Sin UNIQUE(edition_id, team_id) para no fallar con filas
--    antiguas: la función actualiza la fila del par si existe (bajo
--    un candado por par) y si no la crea.
-- ============================================================

ALTER TABLE public.team_edition_stats ADD COLUMN IF NOT EXISTS league text;
ALTER TABLE public.team_edition_stats ADD COLUMN IF NOT EXISTS seed smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_edition_stats_seed_check') THEN
    ALTER TABLE public.team_edition_stats ADD CONSTRAINT team_edition_stats_seed_check
      CHECK ((league IS NULL AND seed IS NULL)
             OR (league IS NOT NULL AND seed IS NOT NULL
                 AND league ~ '^[A-Z0-9]{2,8}$' AND seed BETWEEN 1 AND 16));
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_set_lol_team_seed(
  p_edition_id integer,
  p_team_id    integer,
  p_league     text,
  p_seed       integer,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_league text := upper(NULLIF(btrim(coalesce(p_league, '')), ''));
  v_before jsonb;
  v_after  jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.editions e
    JOIN public.competitions c ON c.id = e.competition_id
    JOIN public.sports s       ON s.id = c.sport_id
    WHERE e.id = p_edition_id AND s.slug = 'lol'
  ) THEN
    RAISE EXCEPTION 'La edición % no existe o no es de LoL', p_edition_id USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_lol_team(p_team_id) THEN
    RAISE EXCEPTION 'El equipo % no existe o no es de LoL', p_team_id USING ERRCODE = '22023';
  END IF;
  IF (v_league IS NULL) <> (p_seed IS NULL) THEN
    RAISE EXCEPTION 'Indica la liga y el número de seed, o deja los dos vacíos para quitarlo' USING ERRCODE = '22023';
  END IF;
  IF v_league IS NOT NULL AND v_league !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'La liga debe ser una sigla de 2 a 8 letras o números (LCK, LPL, LEC…)' USING ERRCODE = '22023';
  END IF;
  IF p_seed IS NOT NULL AND p_seed NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'El seed debe ser un número del 1 al 16' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lol_team_seed'), p_edition_id * 100000 + p_team_id);

  SELECT jsonb_build_object('league', t.league, 'seed', t.seed) INTO v_before
  FROM public.team_edition_stats t
  WHERE t.edition_id = p_edition_id AND t.team_id = p_team_id
  ORDER BY t.id
  LIMIT 1;

  v_after := jsonb_build_object('league', v_league, 'seed', p_seed);
  IF v_before IS NOT DISTINCT FROM v_after
     OR (v_before IS NULL AND v_league IS NULL) THEN
    RETURN;
  END IF;

  IF v_before IS NULL THEN
    INSERT INTO public.team_edition_stats (edition_id, team_id, league, seed)
    VALUES (p_edition_id, p_team_id, v_league, p_seed);
  ELSE
    UPDATE public.team_edition_stats
    SET league = v_league, seed = p_seed
    WHERE edition_id = p_edition_id AND team_id = p_team_id;
  END IF;

  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, team_id, edition_id, before, after, reason)
  VALUES (auth.uid(), v_actor, 'set_team_seed', p_team_id, p_edition_id, v_before, v_after, NULLIF(btrim(p_reason), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_lol_team_seed(integer, integer, text, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_team_seed(integer, integer, text, integer, text) TO authenticated;
