-- ============================================================
--  LoL — racha estricta: el marcador exacto como predicción
--  propia. Solo funciones: no cambia filas de rulesets ni
--  recalcula nada (el rescore se lanza a mano).
--
--  streak_bonus.exact_as_prediction (boolean, por defecto false;
--  exige count_exact_score = true). Con true, para la racha cada
--  serie Bo3/Bo5 son DOS predicciones seguidas: primero el
--  ganador y después el marcador exacto (Bo1: solo el ganador).
--  * Acierto: racha + 1 y se paga en el acto el bonus del tramo
--    de la racha resultante. Una serie puede pagar dos bonus.
--  * Fallo, o serie sin votar desde el primer voto: racha 0.
--    Si se falla el ganador, el marcador cuenta como fallado.
--  * Por fase, en orden (match_date, id); dentro de la serie,
--    ganador antes que marcador.
--  * Mejor racha: máximo alcanzado en la fase (también el pico
--    justo antes de un corte).
--  Los puntos por tramos de cuota no cambian. Con false (o sin la
--  clave) todo es igual que en 20261020100001.
--
--  * validate_ruleset_config: acepta exact_as_prediction.
--  * lol_score_breakdown: racha y bonus por predicción;
--    explanation.streak.steps con la racha y el bonus tras cada
--    una (solo con el flag).
--  * lol_standings_at: rachas actual y mejor por predicción.
--  get_my_lol_breakdowns, score_lol_match, rescore_lol_edition y
--  get_lol_standings no cambian: usan las funciones de arriba.
-- ============================================================


-- ------------------------------------------------------------
--  Validación del config v2 (igual que 20261020100001 + la clave
--  streak_bonus.exact_as_prediction, opcional, booleana y solo
--  true si count_exact_score también es true)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_ruleset_config(p_config jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key  text;
  v_tier jsonb;
  v_prev integer;
  v_from numeric;
  v_i    integer := 0;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'config: debe ser un objeto JSON' USING ERRCODE = '22023';
  END IF;

  IF NOT p_config ? 'version' OR p_config -> 'version' = '1'::jsonb THEN
    RETURN;
  END IF;
  IF p_config -> 'version' <> '2'::jsonb THEN
    RAISE EXCEPTION 'config: versión % no soportada (1 o 2)', p_config -> 'version' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_config) LOOP
    IF v_key NOT IN ('version', 'scoring_type', 'default_best_of', 'prediction_cutoff_minutes',
                     'winner_points', 'exact_score_points', 'streak_bonus', 'perfect_day',
                     'featured_match_bonus') THEN
      RAISE EXCEPTION 'config v2: clave desconocida "%"', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_config ? 'default_best_of'
     AND (p_config -> 'default_best_of') NOT IN ('1'::jsonb, '3'::jsonb, '5'::jsonb) THEN
    RAISE EXCEPTION 'config v2: "default_best_of" debe ser 1, 3 o 5' USING ERRCODE = '22023';
  END IF;

  IF p_config ? 'prediction_cutoff_minutes'
     AND (jsonb_typeof(p_config -> 'prediction_cutoff_minutes') <> 'number'
          OR (p_config ->> 'prediction_cutoff_minutes')::numeric < 0) THEN
    RAISE EXCEPTION 'config v2: "prediction_cutoff_minutes" debe ser un número >= 0' USING ERRCODE = '22023';
  END IF;

  PERFORM public.lol_validate_share_block('winner_points', p_config -> 'winner_points');
  PERFORM public.lol_validate_share_block('exact_score_points', p_config -> 'exact_score_points');

  -- Rachas
  IF jsonb_typeof(p_config -> 'streak_bonus') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'config v2: falta el objeto "streak_bonus"' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_config -> 'streak_bonus') LOOP
    IF v_key NOT IN ('scope', 'tiers', 'count_exact_score', 'exact_as_prediction') THEN
      RAISE EXCEPTION 'config v2: clave desconocida "streak_bonus.%"', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_config -> 'streak_bonus' ? 'count_exact_score'
     AND jsonb_typeof(p_config -> 'streak_bonus' -> 'count_exact_score') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'config v2: "streak_bonus.count_exact_score" debe ser true o false' USING ERRCODE = '22023';
  END IF;
  IF p_config -> 'streak_bonus' ? 'exact_as_prediction'
     AND jsonb_typeof(p_config -> 'streak_bonus' -> 'exact_as_prediction') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'config v2: "streak_bonus.exact_as_prediction" debe ser true o false' USING ERRCODE = '22023';
  END IF;
  IF p_config -> 'streak_bonus' -> 'exact_as_prediction' = 'true'::jsonb
     AND p_config -> 'streak_bonus' -> 'count_exact_score' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'config v2: "streak_bonus.exact_as_prediction" exige "streak_bonus.count_exact_score" = true' USING ERRCODE = '22023';
  END IF;
  IF p_config -> 'streak_bonus' -> 'scope' IS DISTINCT FROM '"phase"'::jsonb THEN
    RAISE EXCEPTION 'config v2: "streak_bonus.scope" debe ser "phase"' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_config -> 'streak_bonus' -> 'tiers') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'config v2: "streak_bonus.tiers" debe ser una lista' USING ERRCODE = '22023';
  END IF;
  FOR v_tier IN SELECT value FROM jsonb_array_elements(p_config -> 'streak_bonus' -> 'tiers') LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_tier) <> 'object'
       OR jsonb_typeof(v_tier -> 'from') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_tier -> 'bonus') IS DISTINCT FROM 'number'
       OR (SELECT COUNT(*) FROM jsonb_object_keys(v_tier)) <> 2 THEN
      RAISE EXCEPTION 'config v2: "streak_bonus.tiers[%]" necesita solo from y bonus numéricos', v_i USING ERRCODE = '22023';
    END IF;
    v_from := (v_tier ->> 'from')::numeric;
    IF v_from <> trunc(v_from) OR v_from < 1 THEN
      RAISE EXCEPTION 'config v2: "streak_bonus.tiers[%].from" debe ser un entero >= 1', v_i USING ERRCODE = '22023';
    END IF;
    IF (v_tier ->> 'bonus')::numeric <> trunc((v_tier ->> 'bonus')::numeric) OR (v_tier ->> 'bonus')::numeric < 0 THEN
      RAISE EXCEPTION 'config v2: "streak_bonus.tiers[%].bonus" debe ser un entero >= 0', v_i USING ERRCODE = '22023';
    END IF;
    IF v_prev IS NOT NULL AND v_from <= v_prev THEN
      RAISE EXCEPTION 'config v2: "streak_bonus.tiers" debe ir de menor a mayor "from", sin repetir' USING ERRCODE = '22023';
    END IF;
    v_prev := v_from::integer;
  END LOOP;

  -- Plenos
  IF jsonb_typeof(p_config -> 'perfect_day') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'config v2: falta el objeto "perfect_day"' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_config -> 'perfect_day') LOOP
    IF v_key NOT IN ('positive', 'negative') THEN
      RAISE EXCEPTION 'config v2: clave desconocida "perfect_day.%"', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_config -> 'perfect_day' -> 'positive') IS DISTINCT FROM 'number'
     OR (p_config -> 'perfect_day' ->> 'positive')::numeric <> trunc((p_config -> 'perfect_day' ->> 'positive')::numeric)
     OR (p_config -> 'perfect_day' ->> 'positive')::numeric < 0 THEN
    RAISE EXCEPTION 'config v2: "perfect_day.positive" debe ser un entero >= 0' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_config -> 'perfect_day' -> 'negative') IS DISTINCT FROM 'number'
     OR (p_config -> 'perfect_day' ->> 'negative')::numeric <> trunc((p_config -> 'perfect_day' ->> 'negative')::numeric)
     OR (p_config -> 'perfect_day' ->> 'negative')::numeric > 0 THEN
    RAISE EXCEPTION 'config v2: "perfect_day.negative" debe ser un entero <= 0' USING ERRCODE = '22023';
  END IF;

  -- Partido de la jornada
  IF jsonb_typeof(p_config -> 'featured_match_bonus') IS DISTINCT FROM 'number'
     OR (p_config ->> 'featured_match_bonus')::numeric <> trunc((p_config ->> 'featured_match_bonus')::numeric)
     OR (p_config ->> 'featured_match_bonus')::numeric < 0 THEN
    RAISE EXCEPTION 'config v2: "featured_match_bonus" debe ser un entero >= 0' USING ERRCODE = '22023';
  END IF;
END;
$$;


-- ------------------------------------------------------------
--  Desglose de una predicción (fuente de verdad)
--  Igual que 20261020100001 salvo con exact_as_prediction:
--  * Predicciones de las series terminadas de la fase desde la del
--    primer voto, hasta esta incluida: ganador y, en Bo3/Bo5,
--    marcador (acierto solo si también acierta el ganador).
--  * Racha tras cada una = aciertos seguidos desde el último fallo
--    o serie sin votar.
--  * streak_bonus = bonus del ganador + bonus del marcador (cada
--    uno, el tramo de la racha tras esa predicción si acierta).
--  * streak_length = racha tras la última predicción de la serie.
--  explanation.streak añade exact_as_prediction y steps: una
--  entrada por predicción con hit, length y bonus.
--  Sin el flag, explanation.streak es la misma que antes.
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
  v_status     text;
  v_home       integer;
  v_away       integer;
  v_date       timestamptz;
  v_phase_id   integer;
  v_edition_id integer;
  v_meta       jsonb;
  v_cfg        jsonb;
  v_pred_home  integer;
  v_pred_away  integer;
  v_featured   boolean;
  v_count_ex   boolean;
  v_strict     boolean;
  v_w_len      integer := 0;
  v_e_len      integer := 0;
  v_w_bonus    integer := 0;
  v_e_bonus    integer := 0;
  v_gain       integer := 0;
  v_voters     integer := 0;
  v_same_win   integer := 0;
  v_same_ex    integer := 0;
  v_first_date timestamptz;
  v_first_id   integer;
  v_fail_date  timestamptz;
  v_fail_id    integer;
  w_points     integer;
  w_tier       text;
  w_share      numeric;
  w_min        integer;
  e_points     integer;
  e_tier       text;
  e_share      numeric;
  e_min        integer;
BEGIN
  SELECT mt.status::text, mt.home_goals, mt.away_goals, mt.match_date, mt.phase_id, ph.edition_id, mt.metadata,
         COALESCE(r.config, '{}'::jsonb)
    INTO v_status, v_home, v_away, v_date, v_phase_id, v_edition_id, v_meta, v_cfg
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
  v_count_ex     := COALESCE(v_cfg -> 'streak_bonus' -> 'count_exact_score' = 'true'::jsonb, false);
  v_strict       := v_count_ex
                    AND COALESCE(v_cfg -> 'streak_bonus' -> 'exact_as_prediction' = 'true'::jsonb, false);

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

    -- Serie del primer voto del jugador en la edición (existe: ha
    -- votado esta).
    SELECT mt.match_date, mt.id
      INTO v_first_date, v_first_id
    FROM public.predictions x
    JOIN public.matches mt ON mt.id = x.match_id
    JOIN public.phases  ph ON ph.id = mt.phase_id
    WHERE x.profile_id = p_profile_id
      AND ph.edition_id = v_edition_id
      AND mt.status <> 'CANCELLED'
    ORDER BY mt.match_date, mt.id
    LIMIT 1;

    IF v_strict THEN
      -- Predicciones de la fase entre el primer voto y esta (k = 1
      -- ganador, k = 2 marcador en Bo3/Bo5). Racha tras cada una =
      -- posición menos la del último fallo anterior (0 si falla).
      WITH ev AS (
        SELECT mt.match_date AS d,
               mt.id         AS mid,
               k.k,
               (x.id IS NOT NULL
                AND sign(x.pred_home_goals - x.pred_away_goals) = sign(mt.home_goals - mt.away_goals)
                AND (k.k = 1 OR (x.pred_home_goals = mt.home_goals AND x.pred_away_goals = mt.away_goals))) AS hit
        FROM public.matches mt
        LEFT JOIN public.predictions x
               ON x.match_id = mt.id AND x.profile_id = p_profile_id
        CROSS JOIN LATERAL (
          SELECT 1 AS k
          UNION ALL
          SELECT 2 WHERE public.lol_series_best_of(mt.metadata, v_cfg) > 1
        ) k
        WHERE mt.phase_id = v_phase_id
          AND mt.status = 'FINISHED'
          AND mt.home_goals IS NOT NULL
          AND mt.away_goals IS NOT NULL
          AND (mt.match_date, mt.id) <= (v_date, p_match_id)
          AND (mt.match_date, mt.id) >= (v_first_date, v_first_id)
      ),
      num AS (
        SELECT ev.*, ROW_NUMBER() OVER (ORDER BY ev.d, ev.mid, ev.k) AS rn
        FROM ev
      ),
      lens AS (
        SELECT num.mid, num.k,
               CASE WHEN num.hit
                    THEN num.rn - COALESCE(MAX(num.rn) FILTER (WHERE NOT num.hit) OVER (ORDER BY num.rn), 0)
                    ELSE 0 END AS len
        FROM num
      )
      SELECT COALESCE(MAX(lens.len) FILTER (WHERE lens.k = 1), 0)::integer,
             COALESCE(MAX(lens.len) FILTER (WHERE lens.k = 2), 0)::integer
        INTO v_w_len, v_e_len
      FROM lens
      WHERE lens.mid = p_match_id;

      v_w_bonus := public.lol_streak_bonus(v_cfg, v_w_len);
      IF best_of > 1 THEN
        v_e_bonus     := CASE WHEN correct_score THEN public.lol_streak_bonus(v_cfg, v_e_len) ELSE 0 END;
        streak_length := v_e_len;
      ELSE
        streak_length := v_w_len;
      END IF;
      streak_bonus := v_w_bonus + v_e_bonus;
      v_gain       := 1 + CASE WHEN best_of > 1 AND correct_score THEN 1 ELSE 0 END;
    ELSE

      -- Último fallo o serie sin votar de la fase, entre el primer
      -- voto y esta.
      SELECT mt.match_date, mt.id
        INTO v_fail_date, v_fail_id
      FROM public.matches mt
      LEFT JOIN public.predictions x
             ON x.match_id = mt.id AND x.profile_id = p_profile_id
      WHERE mt.phase_id = v_phase_id
        AND mt.status = 'FINISHED'
        AND mt.home_goals IS NOT NULL
        AND mt.away_goals IS NOT NULL
        AND (mt.match_date, mt.id) <  (v_date, p_match_id)
        AND (mt.match_date, mt.id) >= (v_first_date, v_first_id)
        AND (x.id IS NULL
             OR sign(x.pred_home_goals - x.pred_away_goals) <> sign(mt.home_goals - mt.away_goals))
      ORDER BY mt.match_date DESC, mt.id DESC
      LIMIT 1;

      -- Tras el último fallo todas son aciertos de ganador (con voto).
      SELECT COALESCE(SUM(1 + CASE WHEN v_count_ex
                                    AND public.lol_series_best_of(mt.metadata, v_cfg) > 1
                                    AND x.pred_home_goals = mt.home_goals
                                    AND x.pred_away_goals = mt.away_goals
                               THEN 1 ELSE 0 END), 0)::integer
        INTO streak_length
      FROM public.matches mt
      JOIN public.predictions x
        ON x.match_id = mt.id AND x.profile_id = p_profile_id
      WHERE mt.phase_id = v_phase_id
        AND mt.status = 'FINISHED'
        AND mt.home_goals IS NOT NULL
        AND mt.away_goals IS NOT NULL
        AND (mt.match_date, mt.id) <= (v_date, p_match_id)
        AND (mt.match_date, mt.id) >= (v_first_date, v_first_id)
        AND (v_fail_id IS NULL OR (mt.match_date, mt.id) > (v_fail_date, v_fail_id));

      v_gain       := 1 + CASE WHEN v_count_ex AND best_of > 1 AND correct_score THEN 1 ELSE 0 END;
      streak_bonus := public.lol_streak_bonus(v_cfg, streak_length);
    END IF;

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
    'streak',  jsonb_build_object(
                 'length',            streak_length,
                 'bonus',             streak_bonus,
                 'gain',              v_gain,
                 'count_exact_score', v_count_ex)
               || CASE WHEN v_strict THEN jsonb_build_object(
                    'exact_as_prediction', true,
                    'steps', jsonb_build_array(
                               jsonb_build_object('prediction', 'winner', 'hit', correct_winner,
                                                  'length', v_w_len, 'bonus', v_w_bonus))
                             || CASE WHEN best_of > 1 THEN jsonb_build_array(
                               jsonb_build_object('prediction', 'exact', 'hit', correct_winner AND correct_score,
                                                  'length', v_e_len, 'bonus', v_e_bonus))
                                ELSE '[]'::jsonb END)
                  ELSE '{}'::jsonb END,
    'featured', jsonb_build_object('match', v_featured, 'bonus', featured_bonus)
  );
  RETURN NEXT;
END;
$$;


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte
--  Igual que 20261020100001 salvo las rachas con
--  exact_as_prediction: cada serie Bo3/Bo5 de esas fases aporta
--  dos predicciones a la secuencia (ganador y luego marcador, que
--  solo acierta si también acierta el ganador), cada una suma 1 y
--  cualquier fallo corta. Racha actual = aciertos desde el último
--  corte; mejor = el tramo de aciertos más largo de la fase en
--  curso (el pico antes de un corte cuenta). Igual que el motor.
--  Misma firma y mismo RETURNS: CREATE OR REPLACE conserva los
--  permisos (nadie la ejecuta desde la API).
-- ------------------------------------------------------------

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
           (mt.match_date AT TIME ZONE e.timezone)::date AS day,
           public.lol_ruleset_version(r.config) = 2
             AND COALESCE(r.config -> 'streak_bonus' -> 'count_exact_score' = 'true'::jsonb, false)
             AND public.lol_series_best_of(mt.metadata, r.config) > 1 AS exact_counts,
           public.lol_ruleset_version(r.config) = 2
             AND COALESCE(r.config -> 'streak_bonus' -> 'count_exact_score' = 'true'::jsonb, false)
             AND COALESCE(r.config -> 'streak_bonus' -> 'exact_as_prediction' = 'true'::jsonb, false)
             AND public.lol_series_best_of(mt.metadata, r.config) > 1 AS exact_step
    FROM public.matches mt
    JOIN public.phases   ph ON ph.id = mt.phase_id
    JOIN public.editions e  ON e.id  = ph.edition_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE e.id = p_edition_id
      AND mt.status <> 'CANCELLED'
  ),
  in_range AS (
    SELECT * FROM edition_matches WHERE p_until IS NULL OR day <= p_until
  ),
  closed_days AS (
    SELECT day
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

  -- Serie del primer voto de cada jugador en la edición.
  first_votes AS (
    SELECT DISTINCT ON (pr.profile_id)
           pr.profile_id AS pid, em.match_date AS first_date, em.id AS first_id
    FROM public.predictions pr
    JOIN edition_matches em ON em.id = pr.match_id
    ORDER BY pr.profile_id, em.match_date, em.id
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
  -- first_id NULL (nunca ha votado) → no cuenta ninguna serie.
  base AS (
    SELECT p.id AS pid,
           p.created_at,
           fv.first_date,
           fv.first_id,
           pj.joined_day
    FROM public.profiles p
    LEFT JOIN first_votes fv ON fv.pid = p.id
    LEFT JOIN pool_joins  pj ON pj.pid = p.id
    WHERE NOT p.is_hidden
      AND (
        (p_pool_id IS NULL     AND fv.pid IS NOT NULL)
        OR
        (p_pool_id IS NOT NULL AND pj.pid IS NOT NULL)
      )
  ),

  -- Series de la ventana que cuentan para cada jugador.
  player_series AS (
    SELECT b.pid, ir.id, ir.status, ir.match_date, ir.phase_id, ir.day, ir.exact_counts, ir.exact_step
    FROM base b
    JOIN in_range ir
      ON b.first_id IS NOT NULL
     AND (ir.match_date, ir.id) >= (b.first_date, b.first_id)
     AND (b.joined_day IS NULL OR ir.day >= b.joined_day)
  ),
  -- Predicciones sobre series terminadas que cuentan.
  preds AS (
    SELECT s.pid,
           s.id                                  AS match_id,
           s.day,
           COALESCE(pr.points_earned, 0)         AS pts,
           COALESCE(pr.is_correct_winner, false) AS ok,
           COALESCE(pr.is_correct_score, false)  AS exact
    FROM player_series s
    JOIN public.predictions pr ON pr.profile_id = s.pid AND pr.match_id = s.id
    WHERE s.status = 'FINISHED'
  ),
  pred_days AS (
    SELECT pid, day, SUM(pts) AS pts, COUNT(*) AS voted, COUNT(*) FILTER (WHERE ok) AS hits
    FROM preds
    GROUP BY pid, day
  ),
  -- Jornadas que cuentan: las cerradas con alguna serie que cuente
  -- (n_series = solo esas) y las abiertas en las que ya tiene puntos.
  player_days AS (
    SELECT s.pid, s.day, COUNT(*) AS n_series
    FROM player_series s
    JOIN closed_days cd ON cd.day = s.day
    GROUP BY s.pid, s.day
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
  played AS (
    SELECT pid, COUNT(*) AS n
    FROM player_series
    WHERE status = 'FINISHED'
    GROUP BY pid
  ),

  -- Rachas: predicciones de las series terminadas que cuentan,
  -- en orden (las no votadas son fallos). k = 1 ganador; k = 2
  -- marcador, solo con exact_as_prediction en Bo3/Bo5. gain = lo
  -- que suma un acierto (2 con count_exact_score sin
  -- exact_as_prediction y exacto acertado).
  seq AS (
    SELECT s.pid,
           s.id,
           s.phase_id,
           s.match_date,
           ev.k,
           CASE WHEN ev.k = 1 THEN COALESCE(p.ok, false)
                ELSE COALESCE(p.ok AND p.exact, false) END AS ok,
           CASE WHEN ev.k = 1 AND NOT s.exact_step
                     AND COALESCE(p.ok, false) AND s.exact_counts AND p.exact
                THEN 2 ELSE 1 END AS gain,
           ROW_NUMBER() OVER (PARTITION BY s.pid ORDER BY s.match_date, s.id, ev.k) AS rn
    FROM player_series s
    CROSS JOIN LATERAL (SELECT 1 AS k UNION ALL SELECT 2 WHERE s.exact_step) ev
    LEFT JOIN preds p ON p.pid = s.pid AND p.match_id = s.id
    WHERE s.status = 'FINISHED'
  ),
  current_phase AS (
    SELECT f.phase_id,
           public.lol_ruleset_version(r.config) = 2 AS is_v2
    FROM in_range f
    JOIN public.phases   ph ON ph.id = f.phase_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    WHERE f.status = 'FINISHED'
    ORDER BY f.match_date DESC, f.id DESC
    LIMIT 1
  ),
  -- v2: una serie de otra fase corta la racha igual que un fallo.
  last_reset AS (
    SELECT s.pid,
           COALESCE(MAX(s.rn) FILTER (
             WHERE NOT s.ok
                OR (cp.is_v2 AND s.phase_id <> cp.phase_id)
           ), 0) AS rn
    FROM seq s
    CROSS JOIN current_phase cp
    GROUP BY s.pid
  ),
  current_streak AS (
    SELECT s.pid, COALESCE(SUM(s.gain) FILTER (WHERE s.rn > lr.rn), 0)::integer AS streak
    FROM seq s
    JOIN last_reset lr ON lr.pid = s.pid
    GROUP BY s.pid
  ),
  phase_runs AS (
    SELECT pid,
           ok,
           gain,
           ROW_NUMBER() OVER (PARTITION BY pid ORDER BY rn)
         - ROW_NUMBER() OVER (PARTITION BY pid, ok ORDER BY rn) AS grp
    FROM seq
    WHERE phase_id = (SELECT phase_id FROM current_phase)
  ),
  best_streak AS (
    SELECT pid, MAX(len)::integer AS best
    FROM (SELECT pid, grp, SUM(gain) AS len FROM phase_runs WHERE ok GROUP BY pid, grp) r
    GROUP BY pid
  ),

  totals AS (
    SELECT b.pid,
           b.created_at,
           COALESCE(o.pts, 0)                  AS total_points,
           COALESCE(h.correct, 0)              AS correct_winners,
           COALESCE(pl.n, 0)                   AS finished_series,
           COALESCE(o.perfects, 0)             AS perfect_days,
           COALESCE(o.negatives, 0)            AS negative_days,
           COALESCE(cs.streak, 0)              AS current_streak,
           COALESCE(bs.best, 0)                AS best_streak
    FROM base b
    LEFT JOIN own            o  ON o.pid  = b.pid
    LEFT JOIN hits           h  ON h.pid  = b.pid
    LEFT JOIN played         pl ON pl.pid = b.pid
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

-- CREATE OR REPLACE conserva los permisos; se repiten por claridad.
REVOKE ALL ON FUNCTION public.lol_score_breakdown(uuid, integer)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date) FROM PUBLIC, anon, authenticated;
