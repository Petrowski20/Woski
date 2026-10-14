-- ============================================================
--  LoL — motor de puntuación v2 (1/2): configuración y datos
--  * validate_ruleset_config(config): valida un config v2
--    ("version": 2) y rechaza el resto de versiones salvo la 1.
--    Sin "version" (rulesets actuales, fútbol incluido) no se
--    valida nada: se comportan como hoy.
--    Trigger en rulesets para que ningún config v2 inválido
--    llegue a guardarse.
--  * Partido de la jornada: matches.metadata.featured_match = true.
--    Trigger que impide marcarlo o desmarcarlo con la votación
--    cerrada y tener dos en la misma jornada (día natural en la
--    zona horaria de la edición). Solo partidos LoL.
--  * lol_prediction_audit: registro de los votos cargados a mano
--    por un administrador (admin_set_lol_prediction, en la
--    migración siguiente). Solo lo leen administradores; nadie
--    escribe directamente.
--  Sin cambios de columnas en tablas existentes.
-- ============================================================


-- ------------------------------------------------------------
--  Validación del config v2
-- ------------------------------------------------------------

-- Bloque de puntos por % de votantes (winner_points / exact_score_points).
CREATE OR REPLACE FUNCTION public.lol_validate_share_block(p_name text, p_block jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key   text;
  v_tier  jsonb;
  v_prev  numeric;
  v_share numeric;
  v_i     integer := 0;
BEGIN
  IF p_block IS NULL OR jsonb_typeof(p_block) <> 'object' THEN
    RAISE EXCEPTION 'config v2: falta el objeto "%"', p_name USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_block) LOOP
    IF v_key NOT IN ('tiers', 'sole_voter_points', 'min_voters_percent', 'min_voters_override', 'fallback_points') THEN
      RAISE EXCEPTION 'config v2: clave desconocida "%.%"', p_name, v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_typeof(p_block -> 'tiers') IS DISTINCT FROM 'array' OR jsonb_array_length(p_block -> 'tiers') = 0 THEN
    RAISE EXCEPTION 'config v2: "%.tiers" debe ser una lista no vacía', p_name USING ERRCODE = '22023';
  END IF;

  FOR v_tier IN SELECT value FROM jsonb_array_elements(p_block -> 'tiers') LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_tier) <> 'object'
       OR jsonb_typeof(v_tier -> 'min_share') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_tier -> 'points') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'config v2: "%.tiers[%]" necesita min_share y points numéricos', p_name, v_i USING ERRCODE = '22023';
    END IF;
    IF (SELECT COUNT(*) FROM jsonb_object_keys(v_tier)) <> 2 THEN
      RAISE EXCEPTION 'config v2: "%.tiers[%]" solo admite min_share y points', p_name, v_i USING ERRCODE = '22023';
    END IF;
    v_share := (v_tier ->> 'min_share')::numeric;
    IF v_share < 0 OR v_share > 100 THEN
      RAISE EXCEPTION 'config v2: "%.tiers[%].min_share" debe estar entre 0 y 100', p_name, v_i USING ERRCODE = '22023';
    END IF;
    IF (v_tier ->> 'points')::numeric <> trunc((v_tier ->> 'points')::numeric) OR (v_tier ->> 'points')::numeric < 0 THEN
      RAISE EXCEPTION 'config v2: "%.tiers[%].points" debe ser un entero >= 0', p_name, v_i USING ERRCODE = '22023';
    END IF;
    IF v_prev IS NOT NULL AND v_share >= v_prev THEN
      RAISE EXCEPTION 'config v2: "%.tiers" debe ir de mayor a menor min_share, sin repetir', p_name USING ERRCODE = '22023';
    END IF;
    v_prev := v_share;
  END LOOP;

  IF v_prev <> 0 THEN
    RAISE EXCEPTION 'config v2: el último tramo de "%.tiers" debe tener min_share 0 (cubre cualquier %%)', p_name USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_block -> 'sole_voter_points') IS DISTINCT FROM 'number'
     OR (p_block ->> 'sole_voter_points')::numeric <> trunc((p_block ->> 'sole_voter_points')::numeric)
     OR (p_block ->> 'sole_voter_points')::numeric < 0 THEN
    RAISE EXCEPTION 'config v2: "%.sole_voter_points" debe ser un entero >= 0', p_name USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_block -> 'fallback_points') IS DISTINCT FROM 'number'
     OR (p_block ->> 'fallback_points')::numeric <> trunc((p_block ->> 'fallback_points')::numeric)
     OR (p_block ->> 'fallback_points')::numeric < 0 THEN
    RAISE EXCEPTION 'config v2: "%.fallback_points" debe ser un entero >= 0', p_name USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_block -> 'min_voters_percent') IS DISTINCT FROM 'number'
     OR (p_block ->> 'min_voters_percent')::numeric < 0
     OR (p_block ->> 'min_voters_percent')::numeric > 100 THEN
    RAISE EXCEPTION 'config v2: "%.min_voters_percent" debe ser un número entre 0 y 100', p_name USING ERRCODE = '22023';
  END IF;

  IF p_block ? 'min_voters_override'
     AND jsonb_typeof(p_block -> 'min_voters_override') <> 'null'
     AND (jsonb_typeof(p_block -> 'min_voters_override') <> 'number'
          OR (p_block ->> 'min_voters_override')::numeric <> trunc((p_block ->> 'min_voters_override')::numeric)
          OR (p_block ->> 'min_voters_override')::numeric < 1) THEN
    RAISE EXCEPTION 'config v2: "%.min_voters_override" debe ser null o un entero >= 1', p_name USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Lanza una excepción con un mensaje claro si el config no es válido.
-- Solo valida "version": 2. Sin "version" o con "version": 1 → v1,
-- sin validar (como hoy). Cualquier otra versión se rechaza.
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
    IF v_key NOT IN ('scope', 'tiers') THEN
      RAISE EXCEPTION 'config v2: clave desconocida "streak_bonus.%"', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
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

CREATE OR REPLACE FUNCTION public.rulesets_validate_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.validate_ruleset_config(NEW.config);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rulesets_validate_config ON public.rulesets;
CREATE TRIGGER trg_rulesets_validate_config
  BEFORE INSERT OR UPDATE OF config ON public.rulesets
  FOR EACH ROW
  EXECUTE FUNCTION public.rulesets_validate_config();


-- ------------------------------------------------------------
--  Partido de la jornada
--  AFTER: la fila ya existe, así que lol_voting_open (integridad)
--  da el corte real sin repetir su cálculo. Se comprueba:
--  * marcar o desmarcar solo con la votación abierta (antes y
--    después del cambio);
--  * como mucho uno por jornada y edición (sin contar cancelados).
--  El candado por edición evita dos marcados a la vez.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lol_matches_check_featured()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_new_featured boolean := COALESCE(NEW.metadata -> 'featured_match' = 'true'::jsonb, false);
  v_old_featured boolean := TG_OP = 'UPDATE' AND COALESCE(OLD.metadata -> 'featured_match' = 'true'::jsonb, false);
  v_edition_id   integer;
  v_tz           text;
  v_day          date;
  v_other        integer;
BEGIN
  IF NOT v_new_featured AND NOT v_old_featured THEN
    RETURN NULL;
  END IF;
  IF NOT public.is_lol_match(NEW.id) THEN
    RETURN NULL;
  END IF;

  IF v_new_featured IS DISTINCT FROM v_old_featured THEN
    IF NOT public.lol_voting_open(NEW.id)
       OR (TG_OP = 'UPDATE'
           AND (OLD.status <> 'PENDING'
                OR now() >= OLD.match_date - make_interval(mins => public.lol_prediction_cutoff_minutes(OLD.id)))) THEN
      RAISE EXCEPTION 'El partido de la jornada solo se puede cambiar mientras la votación de esa serie está abierta'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_new_featured THEN
    SELECT e.id, e.timezone INTO v_edition_id, v_tz
    FROM public.phases ph
    JOIN public.editions e ON e.id = ph.edition_id
    WHERE ph.id = NEW.phase_id;

    PERFORM pg_advisory_xact_lock(hashtext('lol_featured_match'), v_edition_id);

    v_day := (NEW.match_date AT TIME ZONE v_tz)::date;
    SELECT mt.id INTO v_other
    FROM public.matches mt
    JOIN public.phases ph ON ph.id = mt.phase_id
    WHERE ph.edition_id = v_edition_id
      AND mt.id <> NEW.id
      AND mt.status <> 'CANCELLED'
      AND mt.metadata -> 'featured_match' = 'true'::jsonb
      AND (mt.match_date AT TIME ZONE v_tz)::date = v_day
    LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'Ya hay un partido de la jornada el % (partido %)', v_day, v_other
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lol_matches_check_featured ON public.matches;
CREATE TRIGGER trg_lol_matches_check_featured
  AFTER INSERT OR UPDATE OF metadata, match_date, phase_id, status ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.lol_matches_check_featured();


-- ------------------------------------------------------------
--  Auditoría de votos cargados por un administrador
--  Sin FK a matches (su id es smallint en remoto) ni a profiles:
--  el registro se conserva aunque se borre el partido o el
--  usuario. actor_kind: 'admin' (desde la app, actor_id =
--  auth.uid()) o 'sql' (SQL Editor / psql, actor_id NULL).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lol_prediction_audit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prediction_id  integer,
  profile_id     uuid        NOT NULL,
  match_id       integer     NOT NULL,
  actor_id       uuid,
  actor_kind     text        NOT NULL CHECK (actor_kind IN ('admin', 'sql')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  old_home_goals integer,
  old_away_goals integer,
  old_winner_id  integer,
  new_home_goals integer     NOT NULL,
  new_away_goals integer     NOT NULL,
  new_winner_id  integer     NOT NULL,
  reason         text
);

CREATE INDEX IF NOT EXISTS idx_lol_prediction_audit_match ON public.lol_prediction_audit (match_id);
CREATE INDEX IF NOT EXISTS idx_lol_prediction_audit_profile ON public.lol_prediction_audit (profile_id);

ALTER TABLE public.lol_prediction_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lol_prediction_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lol_prediction_audit TO authenticated;

DROP POLICY IF EXISTS "lol_prediction_audit_select_admin" ON public.lol_prediction_audit;
CREATE POLICY "lol_prediction_audit_select_admin"
  ON public.lol_prediction_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text = 'ADMIN'
    )
  );
