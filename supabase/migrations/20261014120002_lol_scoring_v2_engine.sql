-- ============================================================
--  LoL — motor de puntuación v2 (2/2): cálculo
--  Única fuente de verdad de los puntos de LoL. TypeScript solo
--  llama a estas funciones y muestra lo que devuelven.
--
--  * lol_score_breakdown(profile, match): desglose de UNA
--    predicción sobre una serie terminada. Todo lo demás lo usa.
--    - v1 (config sin "version"): exacto → exact_score_points (3),
--      si no ganador → correct_winner_points (1), si no 0. Igual
--      que el antiguo scoreSeriesPrediction de TypeScript.
--    - v2: ganador y marcador exacto (solo best_of > 1) por % de
--      votantes de la serie (sin ocultos, toda la edición),
--      bonus de racha de la fase y bonus de partido de la jornada.
--  * score_lol_match(match): puntúa la serie y las posteriores de
--    su fase (la racha de las siguientes depende de esta).
--  * rescore_lol_edition(edition): recalcula toda la edición en
--    orden cronológico. Ambas idempotentes.
--  * get_my_lol_breakdowns(match_ids): desglose propio para la UI.
--  * admin_set_lol_prediction: carga manual de un voto (auditada).
--  * set_lol_featured_match: marca/desmarca el partido de la jornada.
--  * lol_standings_at: plenos y racha actual según la versión de
--    cada fase. Con rulesets v1 devuelve lo mismo que antes.
--
--  Permisos: las funciones internas no se pueden ejecutar desde la
--  API. Las SECURITY DEFINER comprueban el rol dentro
--  (lol_assert_scoring_actor) antes de tocar nada.
--  Tipos: matches.id y predictions.match_id son smallint en
--  remoto (integer en migraciones antiguas); los parámetros son
--  integer y las comparaciones funcionan con ambos.
-- ============================================================


-- ------------------------------------------------------------
--  Utilidades puras
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_ruleset_version(p_config jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_config -> 'version' = '2'::jsonb THEN 2 ELSE 1 END;
$$;

-- metadata.best_of > ruleset.default_best_of > 3 (igual que resolveBestOf).
CREATE OR REPLACE FUNCTION public.lol_series_best_of(p_metadata jsonb, p_config jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE WHEN p_metadata ->> 'best_of' IN ('1', '3', '5') THEN (p_metadata ->> 'best_of')::integer END,
    CASE WHEN p_config   ->> 'default_best_of' IN ('1', '3', '5') THEN (p_config ->> 'default_best_of')::integer END,
    3
  );
$$;

-- Puntos de un acierto según cuántos votantes eligieron lo mismo.
-- * p_same = 1 (único): sole_voter_points si votaron al menos
--   min_voters en la serie; si no, fallback_points.
-- * Si no, el primer tramo (de mayor a menor) con share >= min_share.
--   share es exacto (sin redondear): 49,9 % → tramo de 25.
-- * min_voters = min_voters_override, o
--   max(1, ceil(min_voters_percent % de los votantes)).
CREATE OR REPLACE FUNCTION public.lol_share_points(p_block jsonb, p_same integer, p_voters integer)
RETURNS TABLE (points integer, tier text, share numeric, min_voters integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tier jsonb;
BEGIN
  min_voters := COALESCE(
    (p_block ->> 'min_voters_override')::integer,
    GREATEST(1, ceil(COALESCE((p_block ->> 'min_voters_percent')::numeric, 1) * p_voters / 100.0)::integer)
  );
  share := CASE WHEN p_voters > 0 THEN p_same * 100.0 / p_voters ELSE 0 END;

  IF p_same = 1 THEN
    IF p_voters >= min_voters THEN
      points := (p_block ->> 'sole_voter_points')::integer;
      tier   := 'sole';
    ELSE
      points := (p_block ->> 'fallback_points')::integer;
      tier   := 'fallback';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_tier IN
    SELECT value FROM jsonb_array_elements(p_block -> 'tiers')
    ORDER BY (value ->> 'min_share')::numeric DESC
  LOOP
    IF share >= (v_tier ->> 'min_share')::numeric THEN
      points := (v_tier ->> 'points')::integer;
      tier   := 'min_share:' || (v_tier ->> 'min_share');
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  points := (p_block ->> 'fallback_points')::integer;
  tier   := 'fallback';
  RETURN NEXT;
END;
$$;

-- Bonus de racha: el del tramo con mayor "from" <= longitud.
CREATE OR REPLACE FUNCTION public.lol_streak_bonus(p_config jsonb, p_length integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (t ->> 'bonus')::integer
    FROM jsonb_array_elements(COALESCE(p_config -> 'streak_bonus' -> 'tiers', '[]'::jsonb)) t
    WHERE (t ->> 'from')::integer <= p_length
    ORDER BY (t ->> 'from')::integer DESC
    LIMIT 1
  ), 0);
$$;


-- ------------------------------------------------------------
--  Desglose de una predicción (fuente de verdad)
--  Sin fila si la serie no existe o no está FINISHED con
--  resultado. Si el jugador no votó: voted = false y todo a 0.
--  Racha (v2): series terminadas de la misma fase, por
--  (match_date, id), hasta esta incluida; cuenta los aciertos de
--  ganador seguidos desde el último fallo o serie sin votar.
--  Las canceladas no están FINISHED: no cuentan ni cortan.
--  SECURITY INVOKER y sin permiso para la API: lee votos ajenos,
--  así que solo se usa desde funciones que ya han comprobado el
--  rol o que solo exponen series cerradas.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_score_breakdown(p_profile_id uuid, p_match_id integer)
RETURNS TABLE (
  match_id       integer,
  profile_id     uuid,
  rules_version  integer,
  best_of        integer,
  voted          boolean,
  correct_winner boolean,
  correct_score  boolean,
  base_winner    integer,
  base_exact     integer,
  streak_length  integer,
  streak_bonus   integer,
  featured_bonus integer,
  total          integer,
  explanation    jsonb
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_status    text;
  v_home      integer;
  v_away      integer;
  v_date      timestamptz;
  v_phase_id  integer;
  v_meta      jsonb;
  v_cfg       jsonb;
  v_pred_home integer;
  v_pred_away integer;
  v_featured  boolean;
  v_voters    integer := 0;
  v_same_win  integer := 0;
  v_same_ex   integer := 0;
  v_fail_date timestamptz;
  v_fail_id   integer;
  w_points    integer;
  w_tier      text;
  w_share     numeric;
  w_min       integer;
  e_points    integer;
  e_tier      text;
  e_share     numeric;
  e_min       integer;
BEGIN
  SELECT mt.status::text, mt.home_goals, mt.away_goals, mt.match_date, mt.phase_id, mt.metadata,
         COALESCE(r.config, '{}'::jsonb)
    INTO v_status, v_home, v_away, v_date, v_phase_id, v_meta, v_cfg
  FROM public.matches  mt
  JOIN public.phases   ph ON ph.id = mt.phase_id
  JOIN public.rulesets r  ON r.id  = ph.ruleset_id
  WHERE mt.id = p_match_id;

  IF NOT FOUND OR v_status <> 'FINISHED' OR v_home IS NULL OR v_away IS NULL THEN
    RETURN;
  END IF;

  match_id       := p_match_id;
  profile_id     := p_profile_id;
  rules_version  := public.lol_ruleset_version(v_cfg);
  best_of        := public.lol_series_best_of(v_meta, v_cfg);
  base_winner    := 0;
  base_exact     := 0;
  streak_length  := 0;
  streak_bonus   := 0;
  featured_bonus := 0;
  v_featured     := COALESCE(v_meta -> 'featured_match' = 'true'::jsonb, false);

  SELECT x.pred_home_goals, x.pred_away_goals
    INTO v_pred_home, v_pred_away
  FROM public.predictions x
  WHERE x.profile_id = p_profile_id
    AND x.match_id   = p_match_id;

  voted          := FOUND;
  correct_winner := voted AND sign(v_pred_home - v_pred_away) = sign(v_home - v_away);
  correct_score  := voted AND v_pred_home = v_home AND v_pred_away = v_away;

  -- ---------------- v1: exactamente como antes ----------------
  IF rules_version = 1 THEN
    IF correct_score THEN
      base_exact := COALESCE((v_cfg ->> 'exact_score_points')::integer, 3);
    ELSIF correct_winner THEN
      base_winner := COALESCE((v_cfg ->> 'correct_winner_points')::integer, 1);
    END IF;
    total := base_winner + base_exact;
    explanation := jsonb_build_object(
      'version', 1,
      'best_of', best_of,
      'voted',   voted,
      'winner',  jsonb_build_object('hit', correct_winner, 'points', base_winner),
      'exact',   jsonb_build_object('hit', correct_score, 'points', base_exact)
    );
    RETURN NEXT;
    RETURN;
  END IF;

  -- ---------------- v2 ----------------
  IF NOT voted THEN
    total := 0;
    explanation := jsonb_build_object('version', 2, 'best_of', best_of, 'voted', false);
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE sign(x.pred_home_goals - x.pred_away_goals) = sign(v_pred_home - v_pred_away)),
         COUNT(*) FILTER (WHERE x.pred_home_goals = v_pred_home AND x.pred_away_goals = v_pred_away)
    INTO v_voters, v_same_win, v_same_ex
  FROM public.predictions x
  JOIN public.profiles    p ON p.id = x.profile_id AND NOT p.is_hidden
  WHERE x.match_id = p_match_id;

  IF correct_winner THEN
    SELECT s.points, s.tier, s.share, s.min_voters
      INTO w_points, w_tier, w_share, w_min
    FROM public.lol_share_points(v_cfg -> 'winner_points', v_same_win, v_voters) s;
    base_winner := w_points;

    -- Último fallo o serie sin votar anterior a esta en la fase.
    SELECT mt.match_date, mt.id
      INTO v_fail_date, v_fail_id
    FROM public.matches mt
    LEFT JOIN public.predictions x
           ON x.match_id = mt.id AND x.profile_id = p_profile_id
    WHERE mt.phase_id = v_phase_id
      AND mt.status = 'FINISHED'
      AND mt.home_goals IS NOT NULL
      AND mt.away_goals IS NOT NULL
      AND (mt.match_date, mt.id) < (v_date, p_match_id)
      AND (x.id IS NULL
           OR sign(x.pred_home_goals - x.pred_away_goals) <> sign(mt.home_goals - mt.away_goals))
    ORDER BY mt.match_date DESC, mt.id DESC
    LIMIT 1;

    SELECT COUNT(*)::integer + 1
      INTO streak_length
    FROM public.matches mt
    WHERE mt.phase_id = v_phase_id
      AND mt.status = 'FINISHED'
      AND mt.home_goals IS NOT NULL
      AND mt.away_goals IS NOT NULL
      AND (mt.match_date, mt.id) < (v_date, p_match_id)
      AND (v_fail_id IS NULL OR (mt.match_date, mt.id) > (v_fail_date, v_fail_id));

    streak_bonus := public.lol_streak_bonus(v_cfg, streak_length);

    IF v_featured THEN
      featured_bonus := COALESCE((v_cfg ->> 'featured_match_bonus')::integer, 0);
    END IF;
  END IF;

  IF best_of > 1 AND correct_score THEN
    SELECT s.points, s.tier, s.share, s.min_voters
      INTO e_points, e_tier, e_share, e_min
    FROM public.lol_share_points(v_cfg -> 'exact_score_points', v_same_ex, v_voters) s;
    base_exact := e_points;
  END IF;

  total := base_winner + base_exact + streak_bonus + featured_bonus;
  explanation := jsonb_build_object(
    'version', 2,
    'best_of', best_of,
    'voted',   true,
    'voters',  v_voters,
    'winner',  jsonb_build_object(
                 'hit',        correct_winner,
                 'votes',      v_same_win,
                 'share',      round(w_share, 2),
                 'tier',       w_tier,
                 'min_voters', w_min,
                 'points',     base_winner),
    'exact',   jsonb_build_object(
                 'applies',    best_of > 1,
                 'hit',        best_of > 1 AND correct_score,
                 'votes',      v_same_ex,
                 'share',      round(e_share, 2),
                 'tier',       e_tier,
                 'min_voters', e_min,
                 'points',     base_exact),
    'streak',  jsonb_build_object('length', streak_length, 'bonus', streak_bonus),
    'featured', jsonb_build_object('match', v_featured, 'bonus', featured_bonus)
  );
  RETURN NEXT;
END;
$$;


-- ------------------------------------------------------------
--  Quién puede puntuar
--  Devuelve el tipo de actor o lanza 42501:
--  * 'service_role': cliente de servicio (JWT con role service_role)
--  * 'admin': usuario con profiles.role = 'ADMIN' (auth.uid())
--  * 'sql': sesión directa de postgres/supabase_admin (SQL Editor,
--    psql) sin JWT. Por la API la sesión es siempre
--    "authenticator", así que esta rama no es alcanzable desde ahí.
--  SECURITY INVOKER: solo la llaman funciones SECURITY DEFINER.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_assert_scoring_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
  v_role   text;
  v_uid    uuid;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role   := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), v_claims ->> 'role');
  v_uid    := auth.uid();

  IF v_role = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role::text = 'ADMIN'
  ) THEN
    RETURN 'admin';
  END IF;

  IF v_role IS NULL AND v_uid IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN 'sql';
  END IF;

  RAISE EXCEPTION 'Solo un administrador puede hacer esto' USING ERRCODE = '42501';
END;
$$;


-- ------------------------------------------------------------
--  Guardar los puntos de una serie (interna)
--  FINISHED con resultado → puntos y aciertos del desglose.
--  Cualquier otro estado → 0 y aciertos a NULL (como hacía el
--  admin al reabrir o cancelar). Solo escribe filas que cambian.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_apply_match_scores(p_match_id integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.matches mt
    WHERE mt.id = p_match_id
      AND mt.status = 'FINISHED'
      AND mt.home_goals IS NOT NULL
      AND mt.away_goals IS NOT NULL
  ) THEN
    UPDATE public.predictions pr
    SET points_earned     = b.total::smallint,
        is_correct_winner = b.correct_winner,
        is_correct_score  = b.correct_score
    FROM public.predictions x
    CROSS JOIN LATERAL public.lol_score_breakdown(x.profile_id, x.match_id) b
    WHERE x.match_id = p_match_id
      AND pr.id = x.id
      AND (pr.points_earned     IS DISTINCT FROM b.total::smallint
           OR pr.is_correct_winner IS DISTINCT FROM b.correct_winner
           OR pr.is_correct_score  IS DISTINCT FROM b.correct_score);
  ELSE
    UPDATE public.predictions pr
    SET points_earned     = 0,
        is_correct_winner = NULL,
        is_correct_score  = NULL
    WHERE pr.match_id = p_match_id
      AND (pr.points_earned IS DISTINCT FROM 0
           OR pr.is_correct_winner IS NOT NULL
           OR pr.is_correct_score  IS NOT NULL);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Puntúa la serie y todas las posteriores de su fase (interna).
CREATE OR REPLACE FUNCTION public.lol_rescore_from_match(p_match_id integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_phase_id   integer;
  v_date       timestamptz;
  v_edition_id integer;
  v_n          integer := 0;
  r            record;
BEGIN
  SELECT mt.phase_id, mt.match_date, ph.edition_id
    INTO v_phase_id, v_date, v_edition_id
  FROM public.matches mt
  JOIN public.phases  ph ON ph.id = mt.phase_id
  WHERE mt.id = p_match_id;

  PERFORM pg_advisory_xact_lock(hashtext('lol_scoring'), v_edition_id);

  FOR r IN
    SELECT mt.id
    FROM public.matches mt
    WHERE mt.phase_id = v_phase_id
      AND (mt.id = p_match_id OR (mt.match_date, mt.id) > (v_date, p_match_id))
    ORDER BY mt.match_date, mt.id
  LOOP
    v_n := v_n + public.lol_apply_match_scores(r.id);
  END LOOP;
  RETURN v_n;
END;
$$;


-- ------------------------------------------------------------
--  API de puntuación (solo service_role / ADMIN / SQL Editor)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.score_lol_match(p_match_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lol_assert_scoring_actor();
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'El partido % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;
  RETURN public.lol_rescore_from_match(p_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rescore_lol_edition(p_edition_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
  r   record;
BEGIN
  PERFORM public.lol_assert_scoring_actor();
  IF NOT EXISTS (
    SELECT 1
    FROM public.editions     e
    JOIN public.competitions c ON c.id = e.competition_id
    JOIN public.sports       s ON s.id = c.sport_id
    WHERE e.id = p_edition_id AND s.slug = 'lol'
  ) THEN
    RAISE EXCEPTION 'La edición % no existe o no es de LoL', p_edition_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lol_scoring'), p_edition_id);

  FOR r IN
    SELECT mt.id
    FROM public.matches mt
    JOIN public.phases  ph ON ph.id = mt.phase_id
    WHERE ph.edition_id = p_edition_id
    ORDER BY ph."order", mt.match_date, mt.id
  LOOP
    v_n := v_n + public.lol_apply_match_scores(r.id);
  END LOOP;
  RETURN v_n;
END;
$$;


-- ------------------------------------------------------------
--  Desglose propio para la UI
--  Solo series LoL terminadas (con la votación ya cerrada) y solo
--  las predicciones de quien llama.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_lol_breakdowns(p_match_ids integer[])
RETURNS TABLE (
  match_id       integer,
  rules_version  integer,
  best_of        integer,
  correct_winner boolean,
  correct_score  boolean,
  base_winner    integer,
  base_exact     integer,
  streak_length  integer,
  streak_bonus   integer,
  featured_bonus integer,
  total          integer,
  explanation    jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.match_id, b.rules_version, b.best_of, b.correct_winner, b.correct_score,
         b.base_winner, b.base_exact, b.streak_length, b.streak_bonus, b.featured_bonus,
         b.total, b.explanation
  FROM public.predictions pr
  CROSS JOIN LATERAL public.lol_score_breakdown(pr.profile_id, pr.match_id) b
  WHERE auth.uid() IS NOT NULL
    AND pr.profile_id = auth.uid()
    AND pr.match_id = ANY (p_match_ids)
    AND public.is_lol_match(pr.match_id)
    AND NOT public.lol_voting_open(pr.match_id);
$$;


-- ------------------------------------------------------------
--  Carga manual de un voto (modo admin)
--  Solo ADMIN desde la app o el SQL Editor (no service_role: el
--  registro necesita saber quién fue). Se salta el corte de
--  votación solo aquí. El ganador debe cuadrar con el marcador;
--  si p_winner_team_id es NULL se deduce del marcador.
--  Deja una fila en lol_prediction_audit, marca la predicción con
--  metadata.admin_entered y, si la serie ya terminó, la vuelve a
--  puntuar (y las posteriores de la fase).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_prediction(
  p_user_id        uuid,
  p_match_id       integer,
  p_winner_team_id integer,
  p_home_score     integer,
  p_away_score     integer,
  p_reason         text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    text;
  v_match    record;
  v_best_of  integer;
  v_wins     integer;
  v_winner   integer;
  v_old_id   integer;
  v_old_home integer;
  v_old_away integer;
  v_old_win  integer;
  v_pred_id  integer;
  v_audit_id bigint;
BEGIN
  v_actor := public.lol_assert_scoring_actor();
  IF v_actor NOT IN ('admin', 'sql') THEN
    RAISE EXCEPTION 'La carga manual de votos solo la puede hacer un administrador identificado' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'El partido % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'El usuario % no existe', p_user_id USING ERRCODE = '22023';
  END IF;

  SELECT mt.status::text AS status, mt.home_team_id, mt.away_team_id, mt.metadata, COALESCE(r.config, '{}'::jsonb) AS config
    INTO v_match
  FROM public.matches  mt
  JOIN public.phases   ph ON ph.id = mt.phase_id
  JOIN public.rulesets r  ON r.id  = ph.ruleset_id
  WHERE mt.id = p_match_id;

  IF v_match.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'El partido % está cancelado', p_match_id USING ERRCODE = '22023';
  END IF;

  v_best_of := public.lol_series_best_of(v_match.metadata, v_match.config);
  v_wins    := (v_best_of + 1) / 2;
  IF p_home_score IS NULL OR p_away_score IS NULL
     OR p_home_score < 0 OR p_away_score < 0
     OR GREATEST(p_home_score, p_away_score) <> v_wins
     OR LEAST(p_home_score, p_away_score) >= v_wins THEN
    RAISE EXCEPTION '%-% no es un resultado válido para un Bo%', p_home_score, p_away_score, v_best_of
      USING ERRCODE = '22023';
  END IF;

  v_winner := CASE WHEN p_home_score > p_away_score THEN v_match.home_team_id ELSE v_match.away_team_id END;
  IF p_winner_team_id IS NOT NULL AND p_winner_team_id <> v_winner THEN
    RAISE EXCEPTION 'El ganador % no cuadra con el marcador %-%', p_winner_team_id, p_home_score, p_away_score
      USING ERRCODE = '22023';
  END IF;

  SELECT pr.id, pr.pred_home_goals, pr.pred_away_goals, pr.pred_winner_id
    INTO v_old_id, v_old_home, v_old_away, v_old_win
  FROM public.predictions pr
  WHERE pr.profile_id = p_user_id AND pr.match_id = p_match_id
  FOR UPDATE;

  INSERT INTO public.lol_prediction_audit (
    prediction_id, profile_id, match_id, actor_id, actor_kind,
    old_home_goals, old_away_goals, old_winner_id,
    new_home_goals, new_away_goals, new_winner_id, reason
  ) VALUES (
    v_old_id, p_user_id, p_match_id, auth.uid(), v_actor,
    v_old_home, v_old_away, v_old_win,
    p_home_score, p_away_score, v_winner, NULLIF(btrim(p_reason), '')
  )
  RETURNING id INTO v_audit_id;

  INSERT INTO public.predictions AS pr (profile_id, match_id, pred_home_goals, pred_away_goals, pred_winner_id, updated_at, metadata)
  VALUES (
    p_user_id, p_match_id, p_home_score, p_away_score, v_winner, now(),
    jsonb_build_object('admin_entered', jsonb_build_object('by', auth.uid(), 'at', now(), 'audit_id', v_audit_id))
  )
  ON CONFLICT (profile_id, match_id) DO UPDATE
    SET pred_home_goals = EXCLUDED.pred_home_goals,
        pred_away_goals = EXCLUDED.pred_away_goals,
        pred_winner_id  = EXCLUDED.pred_winner_id,
        updated_at      = EXCLUDED.updated_at,
        metadata        = pr.metadata || EXCLUDED.metadata
  RETURNING pr.id INTO v_pred_id;

  UPDATE public.lol_prediction_audit SET prediction_id = v_pred_id WHERE id = v_audit_id;

  IF v_match.status = 'FINISHED' THEN
    PERFORM public.lol_rescore_from_match(p_match_id);
  END IF;

  RETURN v_audit_id;
END;
$$;


-- ------------------------------------------------------------
--  Partido de la jornada
--  Las reglas (votación abierta, uno por jornada) las comprueba
--  el trigger trg_lol_matches_check_featured.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_lol_featured_match(p_match_id integer, p_featured boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lol_assert_scoring_actor();
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'El partido % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;

  UPDATE public.matches
  SET metadata   = CASE WHEN p_featured
                        THEN metadata || '{"featured_match": true}'::jsonb
                        ELSE metadata - 'featured_match' END,
      updated_at = now()
  WHERE id = p_match_id
    AND COALESCE(metadata -> 'featured_match' = 'true'::jsonb, false) IS DISTINCT FROM p_featured;
END;
$$;


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte: v1 y v2 por fase
--  Cambios respecto a 20261013100001 (con v1 el resultado es el
--  mismo):
--  * Plenos: el valor sale del ruleset de la jornada (el de la
--    fase de su última serie). v1: negativo −1, positivo 0.
--    v2: perfect_day.negative / perfect_day.positive.
--  * Racha actual: si la fase en curso es v2, solo cuenta dentro
--    de esa fase (la racha se reinicia al cambiar de fase).
--  * Los puntos por serie (con racha y partido de la jornada) ya
--    van en predictions.points_earned, escritos por el motor.
--  * Pasa a SECURITY INVOKER: solo la llama get_lol_standings
--    (SECURITY DEFINER) y nadie más tiene permiso de ejecución.
--  Misma firma: si en la base existe con otro RETURNS se borra.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.lol_standings_at(integer, integer, date)') IS NOT NULL
     AND pg_get_function_result('public.lol_standings_at(integer, integer, date)'::regprocedure)
         <> 'TABLE(profile_id uuid, total_points bigint, correct_winners bigint, finished_series bigint, perfect_days bigint, negative_days bigint, current_streak integer, best_streak integer, rank_position bigint)' THEN
    DROP FUNCTION public.lol_standings_at(integer, integer, date);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.lol_standings_at(
  p_edition_id integer,
  p_pool_id    integer,
  p_until      date
)
RETURNS TABLE (
  profile_id      uuid,
  total_points    bigint,
  correct_winners bigint,
  finished_series bigint,
  perfect_days    bigint,
  negative_days   bigint,
  current_streak  integer,
  best_streak     integer,
  rank_position   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH edition_matches AS (
    SELECT mt.id,
           mt.status,
           mt.match_date,
           mt.phase_id,
           (mt.match_date AT TIME ZONE e.timezone)::date AS day
    FROM public.matches mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    WHERE e.id = p_edition_id
      AND mt.status <> 'CANCELLED'
  ),
  in_range AS (
    SELECT * FROM edition_matches WHERE p_until IS NULL OR day <= p_until
  ),
  finished AS (
    SELECT * FROM in_range WHERE status = 'FINISHED'
  ),
  closed_days AS (
    SELECT day, COUNT(*) AS n_series
    FROM in_range
    GROUP BY day
    HAVING COUNT(*) = COUNT(*) FILTER (WHERE status = 'FINISHED')
  ),
  -- Valor de los plenos de cada jornada: ruleset de la fase de su
  -- última serie.
  day_rules AS (
    SELECT DISTINCT ON (ir.day)
           ir.day,
           CASE WHEN public.lol_ruleset_version(r.config) = 2
                THEN COALESCE((r.config -> 'perfect_day' ->> 'negative')::integer, 0)
                ELSE -1 END AS negative_pts,
           CASE WHEN public.lol_ruleset_version(r.config) = 2
                THEN COALESCE((r.config -> 'perfect_day' ->> 'positive')::integer, 0)
                ELSE 0 END AS positive_pts
    FROM in_range ir
    JOIN public.phases   ph ON ph.id = ir.phase_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    ORDER BY ir.day, ir.match_date DESC, ir.id DESC
  ),

  -- Jornada de la primera predicción de cada jugador en la edición.
  first_days AS (
    SELECT pr.profile_id AS pid, MIN(em.day) AS first_day
    FROM public.predictions pr
    JOIN edition_matches em ON em.id = pr.match_id
    GROUP BY pr.profile_id
  ),
  -- Jornada de entrada al pool (en la zona horaria de la edición).
  pool_joins AS (
    SELECT pm.profile_id AS pid,
           MIN((pm.joined_at AT TIME ZONE e.timezone)::date) AS joined_day
    FROM public.pool_members pm
    JOIN public.pools    po ON po.id = pm.pool_id
    JOIN public.editions e  ON e.id  = po.edition_id
    WHERE p_pool_id IS NOT NULL
      AND pm.pool_id = p_pool_id
      AND po.edition_id = p_edition_id
    GROUP BY pm.profile_id
  ),

  -- Quién aparece: Global = cualquiera con una predicción en la
  -- edición; pool = sus miembros (aunque no hayan votado).
  -- start_day NULL (nunca ha votado) → no cuenta ninguna jornada.
  base AS (
    SELECT p.id AS pid,
           p.created_at,
           CASE
             WHEN fd.first_day IS NULL THEN NULL
             WHEN p_pool_id IS NULL    THEN fd.first_day
             ELSE GREATEST(fd.first_day, pj.joined_day)
           END AS start_day
    FROM public.profiles p
    LEFT JOIN first_days fd ON fd.pid = p.id
    LEFT JOIN pool_joins pj ON pj.pid = p.id
    WHERE NOT p.is_hidden
      AND (
        (p_pool_id IS NULL     AND fd.pid IS NOT NULL)
        OR
        (p_pool_id IS NOT NULL AND pj.pid IS NOT NULL)
      )
  ),

  -- Predicciones sobre series terminadas dentro de la ventana.
  preds AS (
    SELECT b.pid,
           f.id                                  AS match_id,
           f.day,
           COALESCE(pr.points_earned, 0)         AS pts,
           COALESCE(pr.is_correct_winner, false) AS ok
    FROM base b
    JOIN public.predictions pr ON pr.profile_id = b.pid
    JOIN finished f            ON f.id = pr.match_id AND f.day >= b.start_day
  ),
  pred_days AS (
    SELECT pid, day, SUM(pts) AS pts, COUNT(*) AS voted, COUNT(*) FILTER (WHERE ok) AS hits
    FROM preds
    GROUP BY pid, day
  ),
  -- Jornadas que cuentan: todas las cerradas de la ventana (haya
  -- votado o no) y las abiertas en las que ya tiene puntos.
  player_days AS (
    SELECT b.pid, cd.day, cd.n_series
    FROM base b
    JOIN closed_days cd ON cd.day >= b.start_day
    UNION ALL
    SELECT pd.pid, pd.day, NULL
    FROM pred_days pd
    WHERE NOT EXISTS (SELECT 1 FROM closed_days cd WHERE cd.day = pd.day)
  ),
  day_scores AS (
    SELECT d.pid,
           d.day,
           COALESCE(pd.pts, 0) AS pts,
           (d.n_series IS NOT NULL
            AND COALESCE(pd.voted, 0) = d.n_series
            AND COALESCE(pd.hits, 0)  = d.n_series)              AS perfect,
           (d.n_series IS NOT NULL AND COALESCE(pd.hits, 0) = 0) AS negative
    FROM player_days d
    LEFT JOIN pred_days pd ON pd.pid = d.pid AND pd.day = d.day
  ),
  own AS (
    SELECT ds.pid,
           SUM(ds.pts
               + CASE WHEN ds.negative THEN COALESCE(dr.negative_pts, -1) ELSE 0 END
               + CASE WHEN ds.perfect  THEN COALESCE(dr.positive_pts, 0)  ELSE 0 END) AS pts,
           COUNT(*) FILTER (WHERE ds.perfect)  AS perfects,
           COUNT(*) FILTER (WHERE ds.negative) AS negatives
    FROM day_scores ds
    LEFT JOIN day_rules dr ON dr.day = ds.day
    GROUP BY ds.pid
  ),
  hits AS (
    SELECT pid, COUNT(*) FILTER (WHERE ok) AS correct
    FROM preds
    GROUP BY pid
  ),

  -- Rachas: secuencia cronológica de series terminadas de la
  -- ventana de cada jugador (las no votadas son fallos).
  seq AS (
    SELECT b.pid,
           f.id,
           f.phase_id,
           f.match_date,
           COALESCE(p.ok, false) AS ok,
           ROW_NUMBER() OVER (PARTITION BY b.pid ORDER BY f.match_date, f.id) AS rn
    FROM base b
    JOIN finished f   ON f.day >= b.start_day
    LEFT JOIN preds p ON p.pid = b.pid AND p.match_id = f.id
  ),
  current_phase AS (
    SELECT f.phase_id,
           public.lol_ruleset_version(r.config) = 2 AS is_v2
    FROM finished f
    JOIN public.phases   ph ON ph.id = f.phase_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    ORDER BY f.match_date DESC, f.id DESC
    LIMIT 1
  ),
  -- v2: una serie de otra fase corta la racha igual que un fallo.
  current_streak AS (
    SELECT s.pid,
           (MAX(s.rn) - COALESCE(MAX(s.rn) FILTER (
              WHERE NOT s.ok
                 OR (cp.is_v2 AND s.phase_id <> cp.phase_id)
           ), 0))::integer AS streak
    FROM seq s
    CROSS JOIN current_phase cp
    GROUP BY s.pid
  ),
  phase_runs AS (
    SELECT pid,
           ok,
           ROW_NUMBER() OVER (PARTITION BY pid ORDER BY match_date, id)
         - ROW_NUMBER() OVER (PARTITION BY pid, ok ORDER BY match_date, id) AS grp
    FROM seq
    WHERE phase_id = (SELECT phase_id FROM current_phase)
  ),
  best_streak AS (
    SELECT pid, MAX(len)::integer AS best
    FROM (SELECT pid, grp, COUNT(*) AS len FROM phase_runs WHERE ok GROUP BY pid, grp) r
    GROUP BY pid
  ),

  totals AS (
    SELECT b.pid,
           b.created_at,
           COALESCE(o.pts, 0)                  AS total_points,
           COALESCE(h.correct, 0)              AS correct_winners,
           (SELECT COUNT(*) FROM finished)     AS finished_series,
           COALESCE(o.perfects, 0)             AS perfect_days,
           COALESCE(o.negatives, 0)            AS negative_days,
           COALESCE(cs.streak, 0)              AS current_streak,
           COALESCE(bs.best, 0)                AS best_streak
    FROM base b
    LEFT JOIN own            o  ON o.pid  = b.pid
    LEFT JOIN hits           h  ON h.pid  = b.pid
    LEFT JOIN current_streak cs ON cs.pid = b.pid
    LEFT JOIN best_streak    bs ON bs.pid = b.pid
  )
  SELECT t.pid,
         t.total_points::bigint,
         t.correct_winners::bigint,
         t.finished_series::bigint,
         t.perfect_days::bigint,
         t.negative_days::bigint,
         t.current_streak,
         t.best_streak,
         ROW_NUMBER() OVER (
           ORDER BY t.total_points DESC,
                    t.perfect_days DESC,
                    t.best_streak  DESC,
                    t.created_at   ASC
         )
  FROM totals t;
$$;


-- ------------------------------------------------------------
--  Permisos
--  Internas: nadie las ejecuta desde la API.
--  Públicas: authenticated (el rol se comprueba dentro) y
--  service_role donde tiene sentido. Nunca anon.
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.lol_validate_share_block(text, jsonb)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_share_points(jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_streak_bonus(jsonb, integer)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_score_breakdown(uuid, integer)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_assert_scoring_actor()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_apply_match_scores(integer)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_rescore_from_match(integer)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date)  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.score_lol_match(integer)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rescore_lol_edition(integer)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_lol_breakdowns(integer[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_prediction(uuid, integer, integer, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_lol_featured_match(integer, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.score_lol_match(integer)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rescore_lol_edition(integer)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_lol_breakdowns(integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_prediction(uuid, integer, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lol_featured_match(integer, boolean) TO authenticated, service_role;
