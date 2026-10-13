-- ============================================================
--  LoL — integridad de las predicciones
--  No cambia las reglas de puntos (3/1/0). Todo lo de RLS y
--  triggers se limita a partidos de ediciones del deporte "lol":
--  las predicciones de otros deportes conservan su comportamiento.
--
--  * Corte de votación único en la BD:
--    rulesets.config.prediction_cutoff_minutes (60 si falta).
--    - lol_prediction_cutoff_minutes(match_id)
--    - matches.prediction_locks_at: columna calculada (PostgREST)
--      que lee la app, para no repetir el corte en TypeScript.
--    - lol_voting_open(match_id): partido LoL, PENDING y antes del
--      corte.
--    Las tres funciones son SECURITY DEFINER: si la RLS de
--    matches/phases/... ocultase filas al llamante, is_lol_match
--    daría false y las políticas de abajo dejarían pasar todo
--    (fallo abierto). Solo devuelven boolean/integer.
--  * RLS (políticas RESTRICTIVE, se suman a las existentes sin
--    tocarlas):
--    - INSERT/UPDATE/DELETE de predicciones LoL solo con la
--      votación abierta. (Hoy no hay política DELETE permisiva,
--      así que authenticated no puede borrar; la restrictiva deja
--      la regla puesta por si se añade una.)
--    - SELECT de predicciones LoL ajenas solo con la votación
--      cerrada. La propia siempre es legible.
--  * Trigger: authenticated/anon no pueden escribir points_earned,
--    is_correct_winner ni is_correct_score en predicciones LoL.
--    Solo el cliente de servicio (admin) al puntuar.
--  * v_match_predictions pasa a security_invoker si existe (en
--    remoto no existe): respeta la RLS. Para otros deportes
--    devuelve las mismas filas que antes.
--  * get_my_vote_distribution: % de cualquier partido LoL con la
--    votación cerrada, haya votado o no quien pregunta. Excluye
--    usuarios ocultos.
--  * lol_standings_at: nueva regla de "no votar" (ver abajo).
-- ============================================================


-- ------------------------------------------------------------
--  Corte de votación
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_lol_match(p_match_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches      m
    JOIN public.phases       ph ON ph.id = m.phase_id
    JOIN public.editions     e  ON e.id  = ph.edition_id
    JOIN public.competitions c  ON c.id  = e.competition_id
    JOIN public.sports       s  ON s.id  = c.sport_id
    WHERE m.id = p_match_id
      AND s.slug = 'lol'
  );
$$;

-- Minutos antes del inicio en los que se cierra la votación.
-- Sale del ruleset de la fase; 60 si falta o no es un número >= 0.
CREATE OR REPLACE FUNCTION public.lol_prediction_cutoff_minutes(p_match_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN jsonb_typeof(r.config -> 'prediction_cutoff_minutes') = 'number'
                AND (r.config ->> 'prediction_cutoff_minutes')::numeric >= 0
               THEN (r.config ->> 'prediction_cutoff_minutes')::numeric::integer
             END
      FROM public.matches  m
      JOIN public.phases   ph ON ph.id = m.phase_id
      JOIN public.rulesets r  ON r.id  = ph.ruleset_id
      WHERE m.id = p_match_id
    ),
    60
  );
$$;

-- Columna calculada para PostgREST: select('..., prediction_locks_at').
-- La app la usa para bloquear la interfaz con el mismo corte que la RLS.
CREATE OR REPLACE FUNCTION public.prediction_locks_at(m public.matches)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.match_date - make_interval(mins => public.lol_prediction_cutoff_minutes(m.id));
$$;

-- true solo para partidos LoL que aún admiten votos.
-- Para partidos de otros deportes devuelve siempre false.
CREATE OR REPLACE FUNCTION public.lol_voting_open(p_match_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND m.status = 'PENDING'
      AND now() < m.match_date - make_interval(mins => public.lol_prediction_cutoff_minutes(m.id))
      AND public.is_lol_match(m.id)
  );
$$;


-- ------------------------------------------------------------
--  RLS de predictions (solo LoL)
--  RESTRICTIVE: se combinan con AND con las políticas permisivas
--  existentes (predictions_select_all, _insert_own, _update_own),
--  que siguen igual. Para filas de otros deportes estas
--  políticas siempre se cumplen. predictions no tiene política
--  DELETE permisiva: la restrictiva de DELETE no cambia nada hoy.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "predictions_lol_insert_while_open" ON public.predictions;
CREATE POLICY "predictions_lol_insert_while_open"
  ON public.predictions
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    NOT public.is_lol_match(match_id)
    OR public.lol_voting_open(match_id)
  );

DROP POLICY IF EXISTS "predictions_lol_update_while_open" ON public.predictions;
CREATE POLICY "predictions_lol_update_while_open"
  ON public.predictions
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    NOT public.is_lol_match(match_id)
    OR public.lol_voting_open(match_id)
  )
  WITH CHECK (
    NOT public.is_lol_match(match_id)
    OR public.lol_voting_open(match_id)
  );

DROP POLICY IF EXISTS "predictions_lol_delete_while_open" ON public.predictions;
CREATE POLICY "predictions_lol_delete_while_open"
  ON public.predictions
  AS RESTRICTIVE
  FOR DELETE
  USING (
    NOT public.is_lol_match(match_id)
    OR public.lol_voting_open(match_id)
  );

DROP POLICY IF EXISTS "predictions_lol_select_after_close" ON public.predictions;
CREATE POLICY "predictions_lol_select_after_close"
  ON public.predictions
  AS RESTRICTIVE
  FOR SELECT
  USING (
    profile_id = (SELECT auth.uid())
    OR NOT public.lol_voting_open(match_id)
  );


-- ------------------------------------------------------------
--  Columnas de puntuación protegidas (solo LoL)
--  Trigger en vez de permisos por columna: los permisos por
--  columna son de toda la tabla (afectarían al fútbol) y un REVOKE
--  de columna no anula el GRANT de tabla que Supabase da a
--  authenticated/anon; habría que revocar el de tabla y volver a
--  conceder columna a columna (frágil con columnas nuevas).
--  Se comprueba current_user: con el cliente de servicio es
--  service_role y dentro de funciones SECURITY DEFINER es su dueño
--  (postgres), así que la puntuación del admin no se ve afectada.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_predictions_protect_scoring()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.is_lol_match(NEW.match_id)
       AND (COALESCE(NEW.points_earned, 0) <> 0
            OR NEW.is_correct_winner IS NOT NULL
            OR NEW.is_correct_score  IS NOT NULL) THEN
      RAISE EXCEPTION 'points_earned, is_correct_winner e is_correct_score solo los escribe la puntuación'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF (public.is_lol_match(OLD.match_id) OR public.is_lol_match(NEW.match_id))
       AND (NEW.points_earned     IS DISTINCT FROM OLD.points_earned
            OR NEW.is_correct_winner IS DISTINCT FROM OLD.is_correct_winner
            OR NEW.is_correct_score  IS DISTINCT FROM OLD.is_correct_score) THEN
      RAISE EXCEPTION 'points_earned, is_correct_winner e is_correct_score solo los escribe la puntuación'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lol_predictions_protect_scoring ON public.predictions;
CREATE TRIGGER trg_lol_predictions_protect_scoring
  BEFORE INSERT OR UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.lol_predictions_protect_scoring();


-- ------------------------------------------------------------
--  v_match_predictions: sin security_invoker la vista se ejecuta
--  con los permisos de su dueño y se salta la RLS, así que
--  expondría votos LoL abiertos. No la usa la app.
--  Condicional: la crea 20260525100356_schema_completo, pero en la
--  base remota no existe (deriva entre migraciones y producción) y
--  un ALTER VIEW sin más abortaría la migración. Si no existe no
--  hay nada que proteger; si existe (p. ej. en local) se protege.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.v_match_predictions') IS NOT NULL THEN
    ALTER VIEW public.v_match_predictions SET (security_invoker = true);
  END IF;
END;
$$;


-- ------------------------------------------------------------
--  Distribución de votos por resultado.
--  Devuelve filas solo para partidos LoL con la votación cerrada
--  (no PENDING o pasado el corte), para cualquier usuario
--  autenticado, haya votado o no. Excluye usuarios ocultos.
--  CREATE OR REPLACE no puede cambiar el tipo devuelto: si en la
--  base la función existe con otro RETURNS, se borra antes (ningún
--  objeto depende de ella; los permisos se vuelven a dar abajo).
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.get_my_vote_distribution(integer[])') IS NOT NULL
     AND pg_get_function_result('public.get_my_vote_distribution(integer[])'::regprocedure)
         <> 'TABLE(match_id integer, pred_home_goals integer, pred_away_goals integer, votes bigint)' THEN
    DROP FUNCTION public.get_my_vote_distribution(integer[]);
  END IF;
END;
$$;

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
    AND NOT public.lol_voting_open(pr.match_id)
  GROUP BY pr.match_id, pr.pred_home_goals, pr.pred_away_goals;
$$;

REVOKE ALL ON FUNCTION public.get_my_vote_distribution(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vote_distribution(integer[]) TO authenticated;


-- ------------------------------------------------------------
--  Clasificación a una fecha de corte (jornada de la sede).
--  Sustituye la regla de "no votar" (suelo del día):
--  * Ventana de cada jugador: desde la jornada de su primera
--    predicción en la edición; en un pool, desde la jornada en que
--    entró al pool si es posterior. Las jornadas anteriores no
--    suman ni restan (tampoco aciertos ni rachas).
--  * Una serie sin voto es un fallo: 0 puntos y rompe la racha.
--  * Jornada cerrada con 0 ganadores acertados (fallos, series sin
--    votar o mezcla, incluida no votar nada): pleno negativo, −1.
--    Con 1 o más aciertos suma sus puntos normales.
--  * Pleno positivo: votó todas las series de una jornada cerrada
--    y acertó todos los ganadores. No da puntos, solo desempata.
--  * Ya no depende de lo que sacaron otros jugadores.
--  * Orden sin cambios: puntos → plenos positivos → mejor racha de
--    la fase en curso → antigüedad de la cuenta.
--  finished_series sigue siendo el total de series terminadas de
--  la edición. get_lol_standings no cambia.
--  Igual que arriba: si existe con otro RETURNS se borra antes.
--  get_lol_standings la llama desde un cuerpo SQL normal (no
--  BEGIN ATOMIC), así que no hay dependencia que lo impida.
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
SECURITY DEFINER
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
    SELECT pid,
           SUM(pts - CASE WHEN negative THEN 1 ELSE 0 END) AS pts,
           COUNT(*) FILTER (WHERE perfect)                 AS perfects,
           COUNT(*) FILTER (WHERE negative)                AS negatives
    FROM day_scores
    GROUP BY pid
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
  current_streak AS (
    SELECT pid, (MAX(rn) - COALESCE(MAX(rn) FILTER (WHERE NOT ok), 0))::integer AS streak
    FROM seq
    GROUP BY pid
  ),
  current_phase AS (
    SELECT phase_id FROM finished ORDER BY match_date DESC, id DESC LIMIT 1
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

REVOKE ALL ON FUNCTION public.lol_standings_at(integer, integer, date) FROM PUBLIC, anon, authenticated;
