-- ============================================================
--  LoL — centro de operaciones del admin (fase 1)
--  Solo añade objetos; no cambia tablas ni funciones existentes.
--
--  * lol_admin_audit: registro de TODA escritura admin sobre
--    series (crear, editar, resultado, estado, partido de la
--    jornada, recálculo): quién, cuándo, antes y después.
--    Los votos cargados a mano siguen en lol_prediction_audit.
--  * Escrituras (SECURITY DEFINER, ADMIN comprobado dentro con
--    auth.uid(); service_role NO, porque el registro necesita un
--    autor; también desde el SQL Editor como 'sql'):
--    - admin_create_lol_match: validaciones de
--      supabase/seeds/lol_add_series_template.sql.
--    - admin_update_lol_match: fecha y/o best_of con la votación
--      abierta; con votos exige confirmación explícita.
--    - admin_set_lol_match_status: cancelar (CANCELLED, sin
--      borrar) o reabrir (PENDING).
--    - admin_set_lol_match_result: resultado + puntuación.
--    - admin_set_lol_featured_match / admin_rescore_lol_edition:
--      como set_lol_featured_match / rescore_lol_edition, con
--      registro.
--    Las que cambian el calendario o el resultado vuelven a
--    puntuar con el motor (lol_rescore_from_match): sin lógica de
--    puntos nueva.
--  * Lecturas (SECURITY DEFINER, ADMIN dentro):
--    - admin_lol_ops_today(): panel "Hoy" en una llamada.
--    - admin_lol_match_participation(match): quién ha votado
--      (sí/no), nunca qué votó.
--  Participantes de una edición: usuarios no ocultos con alguna
--  predicción en la edición o miembros de un pool de la edición.
-- ============================================================


-- ------------------------------------------------------------
--  Auditoría genérica
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lol_admin_audit (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_kind  text        NOT NULL CHECK (actor_kind IN ('admin', 'sql')),
  action      text        NOT NULL,
  match_id    integer,
  edition_id  integer,
  before      jsonb,
  after       jsonb,
  reason      text
);

CREATE INDEX IF NOT EXISTS idx_lol_admin_audit_match ON public.lol_admin_audit (match_id);
CREATE INDEX IF NOT EXISTS idx_lol_admin_audit_created ON public.lol_admin_audit (created_at DESC);

ALTER TABLE public.lol_admin_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lol_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lol_admin_audit TO authenticated;

DROP POLICY IF EXISTS "lol_admin_audit_select_admin" ON public.lol_admin_audit;
CREATE POLICY "lol_admin_audit_select_admin"
  ON public.lol_admin_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text = 'ADMIN'
    )
  );


-- ------------------------------------------------------------
--  Utilidades internas (sin permiso para la API)
-- ------------------------------------------------------------

-- ADMIN identificado (app) o sesión postgres (SQL Editor). Nunca
-- service_role ni usuarios normales.
CREATE OR REPLACE FUNCTION public.lol_require_admin_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor text := public.lol_assert_scoring_actor();
BEGIN
  IF v_actor NOT IN ('admin', 'sql') THEN
    RAISE EXCEPTION 'Esta operación solo la puede hacer un administrador identificado' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;

-- Foto de una serie para la auditoría.
CREATE OR REPLACE FUNCTION public.lol_match_snapshot(p_match_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status',     m.status,
    'match_date', m.match_date,
    'phase_id',   m.phase_id,
    'home',       th.iso_code,
    'away',       ta.iso_code,
    'home_goals', m.home_goals,
    'away_goals', m.away_goals,
    'metadata',   m.metadata
  )
  FROM public.matches m
  JOIN public.teams th ON th.id = m.home_team_id
  JOIN public.teams ta ON ta.id = m.away_team_id
  WHERE m.id = p_match_id;
$$;

CREATE OR REPLACE FUNCTION public.lol_admin_log(
  p_actor    text,
  p_action   text,
  p_match_id integer,
  p_before   jsonb,
  p_after    jsonb,
  p_reason   text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, match_id, edition_id, before, after, reason)
  SELECT auth.uid(), p_actor, p_action, p_match_id,
         (SELECT ph.edition_id FROM public.matches m JOIN public.phases ph ON ph.id = m.phase_id WHERE m.id = p_match_id),
         p_before, p_after, NULLIF(btrim(p_reason), '')
  RETURNING id;
$$;

-- Participantes de una edición (no ocultos): con alguna predicción
-- en la edición o miembros de alguno de sus pools.
CREATE OR REPLACE FUNCTION public.lol_edition_participants(p_edition_id integer)
RETURNS TABLE (profile_id uuid, nickname text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.nickname
  FROM public.profiles p
  WHERE NOT p.is_hidden
    AND (
      EXISTS (
        SELECT 1
        FROM public.predictions pr
        JOIN public.matches m  ON m.id  = pr.match_id
        JOIN public.phases  ph ON ph.id = m.phase_id
        WHERE pr.profile_id = p.id AND ph.edition_id = p_edition_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.pool_members pm
        JOIN public.pools po ON po.id = pm.pool_id
        WHERE pm.profile_id = p.id AND po.edition_id = p_edition_id
      )
    );
$$;

-- Equipo de LoL por sigla (sin distinguir mayúsculas). Error claro
-- si no existe o hay varios.
CREATE OR REPLACE FUNCTION public.lol_team_by_tag(p_tag text, p_label text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_n  integer;
  v_id integer;
BEGIN
  IF p_tag IS NULL OR btrim(p_tag) = '' THEN
    RAISE EXCEPTION 'Falta la sigla del equipo %', p_label USING ERRCODE = '22023';
  END IF;
  SELECT COUNT(*), MIN(t.id) INTO v_n, v_id
  FROM public.teams  t
  JOIN public.sports s ON s.id = t.sport_id AND s.slug = 'lol'
  WHERE upper(t.iso_code) = upper(btrim(p_tag));
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No hay ningún equipo de LoL con la sigla "%"', btrim(p_tag) USING ERRCODE = '22023';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'La sigla "%" corresponde a % equipos de LoL', btrim(p_tag), v_n USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END;
$$;


-- ------------------------------------------------------------
--  Crear una serie
--  Mismas validaciones que lol_add_series_template.sql:
--  fase de LoL, siglas de LoL (una fila cada una), equipos
--  distintos, best_of 1/3/5, votación todavía abierta con el corte
--  de la fase y sin duplicados (mismo cruce y misma hora en la
--  fase, en cualquier orden, sin contar canceladas). Un cruce
--  repetido en otra fecha se crea con un aviso (revancha).
--  El corte y el partido de la jornada no se recalculan aquí: se
--  inserta la serie y se comprueba con lol_voting_open; el flag lo
--  valida el trigger trg_lol_matches_check_featured.
--  Devuelve {"match_id": n, "warnings": [...]}.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_lol_match(
  p_phase_id   integer,
  p_home_tag   text,
  p_away_tag   text,
  p_match_date timestamptz,
  p_best_of    integer,
  p_featured   boolean DEFAULT false,
  p_reason     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    text := public.lol_require_admin_actor();
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

  IF NOT public.lol_voting_open(v_match_id) THEN
    RAISE EXCEPTION 'Con esa hora de inicio la votación ya estaría cerrada (corte de la fase: % min). Revisa la fecha.',
      public.lol_prediction_cutoff_minutes(v_match_id) USING ERRCODE = '22023';
  END IF;

  IF p_featured THEN
    UPDATE public.matches SET metadata = metadata || '{"featured_match": true}'::jsonb WHERE id = v_match_id;
  END IF;

  PERFORM public.lol_admin_log(v_actor, 'create_match', v_match_id, NULL, public.lol_match_snapshot(v_match_id), p_reason);
  RETURN jsonb_build_object('match_id', v_match_id, 'warnings', v_warnings);
END;
$$;


-- ------------------------------------------------------------
--  Editar fecha y/o best_of
--  Solo series PENDING con la votación abierta. La nueva fecha
--  también debe dejarla abierta. Con votos:
--  * cambiar la fecha exige p_confirm = true (si no, 55000 con el
--    número de votos, para que la app pida confirmación);
--  * cambiar best_of se rechaza siempre: los votos guardados
--    (p. ej. 2-1) dejarían de ser marcadores posibles.
--  NULL = no cambiar ese campo. Recalcula la fase desde la serie.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_lol_match(
  p_match_id   integer,
  p_match_date timestamptz DEFAULT NULL,
  p_best_of    integer     DEFAULT NULL,
  p_confirm    boolean     DEFAULT false,
  p_reason     text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   text := public.lol_require_admin_actor();
  v_before  jsonb;
  v_status  text;
  v_date    timestamptz;
  v_bo      integer;
  v_votes   integer;
BEGIN
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'La serie % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;

  SELECT m.status::text, m.match_date,
         public.lol_series_best_of(m.metadata, COALESCE(r.config, '{}'::jsonb))
    INTO v_status, v_date, v_bo
  FROM public.matches  m
  JOIN public.phases   ph ON ph.id = m.phase_id
  JOIN public.rulesets r  ON r.id  = ph.ruleset_id
  WHERE m.id = p_match_id
  FOR UPDATE OF m;

  IF (p_match_date IS NULL OR p_match_date = v_date) AND (p_best_of IS NULL OR p_best_of = v_bo) THEN
    RAISE EXCEPTION 'No hay cambios que guardar' USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'PENDING' OR NOT public.lol_voting_open(p_match_id) THEN
    RAISE EXCEPTION 'Solo se puede editar una serie pendiente con la votación todavía abierta' USING ERRCODE = '22023';
  END IF;
  IF p_best_of IS NOT NULL AND p_best_of NOT IN (1, 3, 5) THEN
    RAISE EXCEPTION 'El formato debe ser Bo1, Bo3 o Bo5 (recibido %)', p_best_of USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_votes FROM public.predictions WHERE match_id = p_match_id;

  IF p_best_of IS NOT NULL AND p_best_of <> v_bo AND v_votes > 0 THEN
    RAISE EXCEPTION 'No se puede cambiar de Bo% a Bo% con % voto(s) ya guardados: sus marcadores dejarían de ser válidos',
      v_bo, p_best_of, v_votes USING ERRCODE = '22023';
  END IF;
  IF p_match_date IS NOT NULL AND p_match_date <> v_date AND v_votes > 0 AND NOT p_confirm THEN
    RAISE EXCEPTION 'La serie ya tiene % voto(s). Confirma para cambiar la hora; los votos se mantienen.', v_votes
      USING ERRCODE = '55000', DETAIL = v_votes::text;
  END IF;

  v_before := public.lol_match_snapshot(p_match_id);

  UPDATE public.matches
  SET match_date = COALESCE(p_match_date, match_date),
      metadata   = CASE WHEN p_best_of IS NULL THEN metadata ELSE metadata || jsonb_build_object('best_of', p_best_of) END,
      updated_at = now()
  WHERE id = p_match_id;

  IF NOT public.lol_voting_open(p_match_id) THEN
    RAISE EXCEPTION 'Con esa hora de inicio la votación ya estaría cerrada (corte de la fase: % min). Revisa la fecha.',
      public.lol_prediction_cutoff_minutes(p_match_id) USING ERRCODE = '22023';
  END IF;

  PERFORM public.lol_rescore_from_match(p_match_id);
  PERFORM public.lol_admin_log(v_actor, 'update_match', p_match_id, v_before, public.lol_match_snapshot(p_match_id), p_reason);
  RETURN jsonb_build_object('match_id', p_match_id, 'votes', v_votes);
END;
$$;


-- ------------------------------------------------------------
--  Cancelar (CANCELLED) o reabrir (PENDING) una serie
--  Nunca se borra. Quita el resultado y vuelve a puntuar la serie
--  (queda a 0) y las posteriores de su fase.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_match_status(
  p_match_id integer,
  p_status   text,
  p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_before jsonb;
BEGIN
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'La serie % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('PENDING', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estado no permitido: % (solo PENDING o CANCELLED)', p_status USING ERRCODE = '22023';
  END IF;

  v_before := public.lol_match_snapshot(p_match_id);
  IF v_before ->> 'status' = p_status THEN
    RAISE EXCEPTION 'La serie ya está en estado %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.matches
  SET status = p_status::public.match_status,
      home_goals = NULL, away_goals = NULL, winner_id = NULL,
      updated_at = now()
  WHERE id = p_match_id;

  PERFORM public.lol_rescore_from_match(p_match_id);
  PERFORM public.lol_admin_log(v_actor, CASE p_status WHEN 'CANCELLED' THEN 'cancel_match' ELSE 'reopen_match' END,
                               p_match_id, v_before, public.lol_match_snapshot(p_match_id), p_reason);
END;
$$;


-- ------------------------------------------------------------
--  Resultado de una serie (FINISHED) + puntuación
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_match_result(
  p_match_id integer,
  p_home     integer,
  p_away     integer,
  p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_before jsonb;
  v_status text;
  v_bo     integer;
  v_wins   integer;
BEGIN
  IF NOT public.is_lol_match(p_match_id) THEN
    RAISE EXCEPTION 'La serie % no existe o no es de LoL', p_match_id USING ERRCODE = '22023';
  END IF;

  SELECT m.status::text, public.lol_series_best_of(m.metadata, COALESCE(r.config, '{}'::jsonb))
    INTO v_status, v_bo
  FROM public.matches  m
  JOIN public.phases   ph ON ph.id = m.phase_id
  JOIN public.rulesets r  ON r.id  = ph.ruleset_id
  WHERE m.id = p_match_id;

  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'La serie está cancelada: reábrela antes de poner el resultado' USING ERRCODE = '22023';
  END IF;
  v_wins := (v_bo + 1) / 2;
  IF p_home IS NULL OR p_away IS NULL OR p_home < 0 OR p_away < 0
     OR GREATEST(p_home, p_away) <> v_wins OR LEAST(p_home, p_away) >= v_wins THEN
    RAISE EXCEPTION '%-% no es un resultado válido para un Bo%', p_home, p_away, v_bo USING ERRCODE = '22023';
  END IF;

  v_before := public.lol_match_snapshot(p_match_id);

  UPDATE public.matches
  SET status = 'FINISHED',
      home_goals = p_home,
      away_goals = p_away,
      winner_id  = CASE WHEN p_home > p_away THEN home_team_id ELSE away_team_id END,
      updated_at = now()
  WHERE id = p_match_id;

  PERFORM public.lol_rescore_from_match(p_match_id);
  PERFORM public.lol_admin_log(v_actor, 'set_result', p_match_id, v_before, public.lol_match_snapshot(p_match_id), p_reason);
END;
$$;


-- ------------------------------------------------------------
--  Partido de la jornada y recálculo, con registro
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_lol_featured_match(
  p_match_id integer,
  p_featured boolean,
  p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text := public.lol_require_admin_actor();
  v_before jsonb;
BEGIN
  v_before := public.lol_match_snapshot(p_match_id);
  PERFORM public.set_lol_featured_match(p_match_id, p_featured);
  PERFORM public.lol_admin_log(v_actor, CASE WHEN p_featured THEN 'feature_match' ELSE 'unfeature_match' END,
                               p_match_id, v_before, public.lol_match_snapshot(p_match_id), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rescore_lol_edition(p_edition_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := public.lol_require_admin_actor();
  v_n     integer;
BEGIN
  v_n := public.rescore_lol_edition(p_edition_id);
  INSERT INTO public.lol_admin_audit (actor_id, actor_kind, action, edition_id, after)
  VALUES (auth.uid(), v_actor, 'rescore_edition', p_edition_id, jsonb_build_object('changed', v_n));
  RETURN v_n;
END;
$$;


-- ------------------------------------------------------------
--  Panel "Hoy" (una sola llamada)
--  Ediciones LoL activas (start_date <= hoy <= end_date, hora de
--  Madrid, igual que la app). Fechas en UTC; la app las muestra en
--  Europe/Madrid.
--  * open: series PENDING con la votación abierta, con votos y
--    participantes.
--  * needs_result: series PENDING / IN_PROGRESS cuya hora de
--    inicio ya pasó.
--  * open_days: jornadas (día de la sede) que ya empezaron y aún
--    tienen series sin terminar; "blocking" son las pendientes cuya
--    hora ya pasó (aplazadas o sin resultado) y mantienen la
--    jornada abierta.
--  * editions: fases con su ruleset y versión del config; current
--    = fase de la última serie iniciada (o de la próxima).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_lol_ops_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_result jsonb;
BEGIN
  PERFORM public.lol_require_admin_actor();

  WITH ed AS (
    SELECT e.id, c.name || ' ' || e.name AS name, e.timezone
    FROM public.editions     e
    JOIN public.competitions c ON c.id = e.competition_id
    JOIN public.sports       s ON s.id = c.sport_id AND s.slug = 'lol'
    WHERE e.start_date <= v_today AND e.end_date >= v_today
  ),
  ms AS (
    SELECT m.id, m.status::text AS status, m.match_date, m.phase_id, m.metadata,
           ed.id AS edition_id, ed.name AS edition_name, ed.timezone,
           ph.name AS phase_name, r.config,
           th.iso_code AS home, ta.iso_code AS away,
           (m.match_date AT TIME ZONE ed.timezone)::date AS day,
           public.prediction_locks_at(m) AS locks_at,
           public.lol_series_best_of(m.metadata, COALESCE(r.config, '{}'::jsonb)) AS best_of,
           COALESCE(m.metadata -> 'featured_match' = 'true'::jsonb, false) AS featured
    FROM public.matches  m
    JOIN public.phases   ph ON ph.id = m.phase_id
    JOIN ed                 ON ed.id = ph.edition_id
    JOIN public.rulesets r  ON r.id  = ph.ruleset_id
    JOIN public.teams    th ON th.id = m.home_team_id
    JOIN public.teams    ta ON ta.id = m.away_team_id
  ),
  participants AS (
    SELECT ed.id AS edition_id, COUNT(pp.profile_id) AS n
    FROM ed CROSS JOIN LATERAL public.lol_edition_participants(ed.id) pp
    GROUP BY ed.id
  ),
  votes AS (
    SELECT pr.match_id, COUNT(*) AS n
    FROM public.predictions pr
    JOIN public.profiles p ON p.id = pr.profile_id AND NOT p.is_hidden
    WHERE pr.match_id IN (SELECT id FROM ms)
    GROUP BY pr.match_id
  ),
  item AS (
    SELECT ms.*, jsonb_build_object(
             'id', ms.id, 'edition_id', ms.edition_id, 'edition', ms.edition_name, 'phase', ms.phase_name,
             'home', ms.home, 'away', ms.away, 'status', ms.status, 'best_of', ms.best_of,
             'featured', ms.featured, 'match_date', ms.match_date, 'locks_at', ms.locks_at,
             'votes', COALESCE(v.n, 0), 'participants', COALESCE(pa.n, 0)
           ) AS j
    FROM ms
    LEFT JOIN votes        v  ON v.match_id = ms.id
    LEFT JOIN participants pa ON pa.edition_id = ms.edition_id
  ),
  days AS (
    SELECT i.edition_id, i.edition_name, i.day,
           COUNT(*)                                             AS series,
           COUNT(*) FILTER (WHERE i.status = 'FINISHED')        AS finished,
           jsonb_agg(i.j ORDER BY i.match_date, i.id) FILTER (WHERE i.status <> 'FINISHED')                       AS pending,
           jsonb_agg(i.j ORDER BY i.match_date, i.id) FILTER (WHERE i.status <> 'FINISHED' AND i.match_date <= now()) AS blocking
    FROM item i
    WHERE i.status <> 'CANCELLED'
    GROUP BY i.edition_id, i.edition_name, i.day
    HAVING i.day <= (now() AT TIME ZONE MIN(i.timezone))::date
       AND COUNT(*) FILTER (WHERE i.status = 'FINISHED') < COUNT(*)
  ),
  current_phase AS (
    SELECT DISTINCT ON (edition_id) edition_id, phase_id
    FROM ms
    WHERE status <> 'CANCELLED'
    ORDER BY edition_id, (match_date > now()), CASE WHEN match_date <= now() THEN -extract(epoch FROM match_date) ELSE extract(epoch FROM match_date) END
  ),
  phases_j AS (
    SELECT ph.edition_id,
           jsonb_agg(jsonb_build_object(
             'id', ph.id, 'name', ph.name, 'order', ph."order",
             'ruleset', r.name, 'version', public.lol_ruleset_version(r.config),
             'default_best_of', r.config -> 'default_best_of',
             'cutoff_minutes', r.config -> 'prediction_cutoff_minutes',
             'current', cp.phase_id IS NOT NULL
           ) ORDER BY ph."order", ph.id) AS phases
    FROM public.phases ph
    JOIN ed ON ed.id = ph.edition_id
    JOIN public.rulesets r ON r.id = ph.ruleset_id
    LEFT JOIN current_phase cp ON cp.edition_id = ph.edition_id AND cp.phase_id = ph.id
    GROUP BY ph.edition_id
  )
  SELECT jsonb_build_object(
    'now', now(),
    'open', COALESCE((SELECT jsonb_agg(j ORDER BY match_date, id) FROM item
                      WHERE status = 'PENDING' AND public.lol_voting_open(id)), '[]'::jsonb),
    'needs_result', COALESCE((SELECT jsonb_agg(j ORDER BY match_date, id) FROM item
                              WHERE status IN ('PENDING', 'IN_PROGRESS') AND match_date <= now()), '[]'::jsonb),
    'open_days', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'edition_id', edition_id, 'edition', edition_name, 'day', day,
                             'series', series, 'finished', finished,
                             'pending', pending, 'blocking', COALESCE(blocking, '[]'::jsonb))
                           ORDER BY day, edition_id) FROM days), '[]'::jsonb),
    'editions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'id', ed.id, 'name', ed.name, 'timezone', ed.timezone,
                            'phases', COALESCE(pj.phases, '[]'::jsonb)) ORDER BY ed.id)
                          FROM ed LEFT JOIN phases_j pj ON pj.edition_id = ed.id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
--  Participación en una serie: quién ha votado (sí/no).
--  Nunca devuelve el voto. Sin usuarios ocultos.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_lol_match_participation(p_match_id integer)
RETURNS TABLE (profile_id uuid, nickname text, has_voted boolean)
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
  SELECT pp.profile_id, pp.nickname,
         EXISTS (SELECT 1 FROM public.predictions pr WHERE pr.match_id = p_match_id AND pr.profile_id = pp.profile_id)
  FROM public.lol_edition_participants(v_edition_id) pp
  ORDER BY 3, lower(pp.nickname);
END;
$$;


-- ------------------------------------------------------------
--  Permisos
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.lol_require_admin_actor()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_match_snapshot(integer)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_admin_log(text, text, integer, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_edition_participants(integer)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lol_team_by_tag(text, text)              FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_create_lol_match(integer, text, text, timestamptz, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_lol_match(integer, timestamptz, integer, boolean, text)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_match_status(integer, text, text)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_match_result(integer, integer, integer, text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_lol_featured_match(integer, boolean, text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rescore_lol_edition(integer)                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_lol_ops_today()                                                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_lol_match_participation(integer)                                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_lol_match(integer, text, text, timestamptz, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lol_match(integer, timestamptz, integer, boolean, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_match_status(integer, text, text)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_match_result(integer, integer, integer, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_lol_featured_match(integer, boolean, text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rescore_lol_edition(integer)                                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lol_ops_today()                                                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lol_match_participation(integer)                                        TO authenticated;
