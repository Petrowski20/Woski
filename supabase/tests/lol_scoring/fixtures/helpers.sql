-- ============================================================
--  Utilidades de los tests (esquema t). Solo crean datos con
--  ids deterministas; no dependen del motor v2, así que se cargan
--  antes de sus migraciones (las usa también la foto v1).
-- ============================================================

DROP SCHEMA IF EXISTS t CASCADE;
CREATE SCHEMA t;

-- Config v2 oficial (la de supabase/seeds/worlds_2026_playin_v2.sql).
CREATE FUNCTION t.cfg_v2(p_best_of integer DEFAULT 5, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'version', 2,
    'default_best_of', p_best_of,
    'prediction_cutoff_minutes', 0,
    'winner_points', jsonb_build_object(
      'tiers', '[{"min_share":50,"points":2},{"min_share":25,"points":3},{"min_share":0,"points":4}]'::jsonb,
      'sole_voter_points', 6, 'min_voters_percent', 1, 'min_voters_override', NULL, 'fallback_points', 2),
    'exact_score_points', jsonb_build_object(
      'tiers', '[{"min_share":50,"points":2},{"min_share":25,"points":3},{"min_share":0,"points":4}]'::jsonb,
      'sole_voter_points', 6, 'min_voters_percent', 1, 'min_voters_override', NULL, 'fallback_points', 2),
    'streak_bonus', jsonb_build_object(
      'scope', 'phase',
      'tiers', '[{"from":3,"bonus":1},{"from":7,"bonus":2},{"from":12,"bonus":3},{"from":18,"bonus":4}]'::jsonb),
    'perfect_day', jsonb_build_object('positive', 0, 'negative', -2),
    'featured_match_bonus', 2
  ) || p_patch;
$$;

CREATE FUNCTION t.edition(p_name text, p_tz text DEFAULT 'Europe/Berlin')
RETURNS integer LANGUAGE sql AS $$
  INSERT INTO public.editions (competition_id, name, start_date, end_date, timezone)
  SELECT c.id, p_name, DATE '2026-08-01', DATE '2026-12-31', p_tz
  FROM public.competitions c WHERE c.slug = 'worlds'
  RETURNING id;
$$;

CREATE FUNCTION t.ruleset(p_name text, p_config jsonb)
RETURNS integer LANGUAGE sql AS $$
  INSERT INTO public.rulesets (name, config) VALUES (p_name, p_config) RETURNING id;
$$;

CREATE FUNCTION t.phase(p_edition integer, p_ruleset integer, p_name text, p_order integer DEFAULT 0)
RETURNS integer LANGUAGE sql AS $$
  INSERT INTO public.phases (edition_id, ruleset_id, name, "order")
  VALUES (p_edition, p_ruleset, p_name, p_order)
  RETURNING id;
$$;

CREATE FUNCTION t.team(p_tag text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_id integer;
BEGIN
  SELECT id INTO v_id FROM public.teams WHERE slug = 'lol-test-' || lower(p_tag);
  IF v_id IS NULL THEN
    INSERT INTO public.teams (sport_id, slug, name, iso_code)
    SELECT s.id, 'lol-test-' || lower(p_tag), 'Team ' || p_tag, p_tag
    FROM public.sports s WHERE s.slug = 'lol'
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Jugador con uuid determinista (md5 del nick).
CREATE FUNCTION t.player(p_nick text, p_hidden boolean DEFAULT false,
                         p_created timestamptz DEFAULT TIMESTAMPTZ '2026-01-01 00:00+00',
                         p_role text DEFAULT 'USER')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := md5('woski-test:' || p_nick)::uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, nickname, created_at, is_hidden, role)
  VALUES (v_id, p_nick, p_created, p_hidden, p_role::public.user_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE FUNCTION t.uid(p_nick text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('woski-test:' || p_nick)::uuid $$;

-- Serie PENDING. p_featured: se crea en el futuro (votación
-- abierta), se marca y después se lleva a su fecha real, igual que
-- haría el admin antes de que empiece.
CREATE FUNCTION t.match(p_phase integer, p_date timestamptz, p_best_of integer DEFAULT NULL,
                        p_home text DEFAULT 'AAA', p_away text DEFAULT 'BBB',
                        p_featured boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_id integer;
BEGIN
  INSERT INTO public.matches (home_team_id, away_team_id, match_date, status, phase_id, metadata)
  VALUES (t.team(p_home), t.team(p_away),
          CASE WHEN p_featured THEN now() + interval '7 days' ELSE p_date END,
          'PENDING', p_phase,
          CASE WHEN p_best_of IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('best_of', p_best_of) END
          || CASE WHEN p_featured THEN '{"featured_match": true}'::jsonb ELSE '{}'::jsonb END)
  RETURNING id INTO v_id;
  IF p_featured THEN
    UPDATE public.matches SET match_date = p_date WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION t.vote(p_user uuid, p_match integer, p_home integer, p_away integer)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.predictions (profile_id, match_id, pred_home_goals, pred_away_goals)
  VALUES (p_user, p_match, p_home, p_away)
  ON CONFLICT (profile_id, match_id) DO UPDATE
    SET pred_home_goals = EXCLUDED.pred_home_goals,
        pred_away_goals = EXCLUDED.pred_away_goals;
$$;

-- n jugadores nuevos (prefijo + número) que votan lo mismo.
CREATE FUNCTION t.crowd(p_prefix text, p_n integer, p_match integer, p_home integer, p_away integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  FOR i IN 1..p_n LOOP
    PERFORM t.vote(t.player(p_prefix || i), p_match, p_home, p_away);
  END LOOP;
END;
$$;

CREATE FUNCTION t.finish(p_match integer, p_home integer, p_away integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.matches
  SET status = 'FINISHED', home_goals = p_home, away_goals = p_away,
      winner_id = CASE WHEN p_home > p_away THEN home_team_id ELSE away_team_id END
  WHERE id = p_match;
$$;

CREATE FUNCTION t.pts(p_user uuid, p_match integer)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT points_earned::integer FROM public.predictions WHERE profile_id = p_user AND match_id = p_match;
$$;

-- Fila de la clasificación de un jugador.
CREATE FUNCTION t.standing(p_edition integer, p_user uuid, p_pool integer DEFAULT NULL, p_until date DEFAULT NULL)
RETURNS TABLE (total_points bigint, perfect_days bigint, negative_days bigint,
               current_streak integer, best_streak integer, rank_position bigint)
LANGUAGE sql STABLE AS $$
  SELECT s.total_points, s.perfect_days, s.negative_days, s.current_streak, s.best_streak, s.rank_position
  FROM public.lol_standings_at(p_edition, p_pool, p_until) s
  WHERE s.profile_id = p_user;
$$;

-- Sesiones simuladas como las de PostgREST (claims del JWT + rol).
-- Se deshacen con t.as_postgres() o al terminar la transacción.
CREATE FUNCTION t.claims(p_role text, p_user uuid DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_user))::text;
$$;

-- Ejecuta p_sql como lo haría PostgREST: rol + claims del JWT.
-- p_role NULL = sesión directa de postgres (SQL Editor).
-- Devuelve el primer valor como texto ('ok' si es NULL) o
-- "SQLSTATE: mensaje" si falla. El rol se restaura siempre.
CREATE FUNCTION t.run_as(p_role text, p_user uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_res text;
BEGIN
  BEGIN
    IF p_role IS NOT NULL THEN
      -- Los dos formatos de PostgREST: auth.uid() de esta imagen lee
      -- request.jwt.claim.sub; el de Supabase cloud también claims.
      PERFORM set_config('request.jwt.claims', t.claims(p_role, p_user), true);
      PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
      PERFORM set_config('request.jwt.claim.role', p_role, true);
      PERFORM set_config('role', p_role, true);
    END IF;
    EXECUTE p_sql INTO v_res;
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
    RETURN COALESCE(NULLIF(v_res, ''), 'ok');   -- void → ''
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE || ': ' || SQLERRM;
  END;
END;
$$;

GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;
