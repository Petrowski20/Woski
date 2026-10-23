-- Clasificación por fase y desempate de la general (20261030100001).
-- Dos fases v2 Bo1 con puntos planos (1 por acierto, sin bonus de
-- racha ni puntos de pleno) y una serie por jornada: cada acierto es
-- un pleno positivo, así que puntos y plenos empatan y decide la racha.
--   Fase A: días 1-3 · Fase B: días 4-6 · todas acaban 1-0
--   pf-1: A ✓✓✓  B ✗✗✗  → 3 pts, mejor racha A 3, B 0
--   pf-2: A ✗✓✗  B ✓✓✗  → 3 pts, mejor racha A 1, B 2 (cuenta más antigua)
--   pf-3: empieza en B: ✓ ✗ ✗
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(19);

DO $$
DECLARE
  flat jsonb := t.cfg_v2(1, jsonb_build_object(
    'winner_points', jsonb_build_object(
      'tiers', '[{"min_share":0,"points":1}]'::jsonb,
      'sole_voter_points', 1, 'min_voters_percent', 1, 'min_voters_override', NULL, 'fallback_points', 1),
    'streak_bonus', jsonb_build_object('scope', 'phase', 'tiers', '[{"from":100,"bonus":1}]'::jsonb),
    'perfect_day', jsonb_build_object('positive', 0, 'negative', 0),
    'featured_match_bonus', 0));
  e  integer := t.edition('fases');
  r  integer := t.ruleset('fases plano', flat);
  pa integer := t.phase(e, r, 'Fase A', 0);
  pb integer := t.phase(e, r, 'Fase B', 1);
  p1 uuid := t.player('pf-1', false, TIMESTAMPTZ '2026-02-01 00:00+00');
  p2 uuid := t.player('pf-2', false, TIMESTAMPTZ '2026-01-01 00:00+00');
  p3 uuid := t.player('pf-3', false, TIMESTAMPTZ '2026-03-01 00:00+00');
  a  integer[] := '{}';
  b  integer[] := '{}';
  pool integer;
BEGIN
  FOR i IN 1..3 LOOP
    a := a || t.match(pa, TIMESTAMPTZ '2026-10-01 10:00+00' + (i - 1) * interval '1 day');
    b := b || t.match(pb, TIMESTAMPTZ '2026-10-04 10:00+00' + (i - 1) * interval '1 day');
  END LOOP;
  PERFORM t.vote(p1, a[1], 1, 0); PERFORM t.vote(p1, a[2], 1, 0); PERFORM t.vote(p1, a[3], 1, 0);
  PERFORM t.vote(p1, b[1], 0, 1); PERFORM t.vote(p1, b[2], 0, 1); PERFORM t.vote(p1, b[3], 0, 1);
  PERFORM t.vote(p2, a[1], 0, 1); PERFORM t.vote(p2, a[2], 1, 0); PERFORM t.vote(p2, a[3], 0, 1);
  PERFORM t.vote(p2, b[1], 1, 0); PERFORM t.vote(p2, b[2], 1, 0); PERFORM t.vote(p2, b[3], 0, 1);
  PERFORM t.vote(p3, b[1], 1, 0); PERFORM t.vote(p3, b[2], 0, 1); PERFORM t.vote(p3, b[3], 0, 1);
  FOR i IN 1..3 LOOP PERFORM t.finish(a[i], 1, 0); PERFORM t.finish(b[i], 1, 0); END LOOP;
  PERFORM rescore_lol_edition(e);

  INSERT INTO pools (name, edition_id) VALUES ('pool fases', e) RETURNING id INTO pool;
  INSERT INTO pool_members (profile_id, pool_id, joined_at) VALUES
    (p1, pool, TIMESTAMPTZ '2026-09-01 00:00+00'),
    (p3, pool, TIMESTAMPTZ '2026-09-01 00:00+00');
  CREATE TEMP TABLE pf_ids AS SELECT e, pa, pb, pool;
END;
$$;

CREATE FUNCTION pg_temp.row_of(p_nick text, p_phase integer, p_pool integer DEFAULT NULL)
RETURNS TABLE (total_points bigint, perfect_days bigint, current_streak integer, best_streak integer, rank_position bigint)
LANGUAGE sql AS $$
  SELECT s.total_points, s.perfect_days, s.current_streak, s.best_streak, s.rank_position
  FROM lol_standings_at((SELECT e FROM pf_ids), p_pool, NULL, p_phase) s
  WHERE s.profile_id = t.uid(p_nick);
$$;

-- ---------------- General ----------------
SELECT is((SELECT total_points || '/' || perfect_days FROM pg_temp.row_of('pf-1', NULL)), '3/3', 'pf-1: 3 puntos y 3 plenos');
SELECT is((SELECT total_points || '/' || perfect_days FROM pg_temp.row_of('pf-2', NULL)), '3/3', 'pf-2: 3 puntos y 3 plenos (empate)');
SELECT is((SELECT rank_position FROM pg_temp.row_of('pf-1', NULL)), 1::bigint,
          'general: desempata la mejor racha de la edición (pf-1, 3 en la fase A) aunque pf-2 tenga más racha en la fase en curso y cuenta más antigua');
SELECT is((SELECT string_agg(best_streak::text, ',' ORDER BY n) FROM (VALUES ('pf-1', 1), ('pf-2', 2)) v(nick, n)
           CROSS JOIN LATERAL pg_temp.row_of(v.nick, NULL)),
          '0,2', 'general: la columna mejor racha sigue siendo la de la fase en curso (B)');
SELECT is((SELECT rank_position FROM lol_standings_at((SELECT e FROM pf_ids), NULL, NULL) s WHERE s.profile_id = t.uid('pf-1')),
          1::bigint, 'lol_standings_at de 3 argumentos = general');

-- ---------------- Fase A ----------------
SELECT is((SELECT total_points || '/' || best_streak || '/' || rank_position FROM pg_temp.row_of('pf-1', (SELECT pa FROM pf_ids))),
          '3/3/1', 'fase A: pf-1 3 puntos, racha 3, primero');
SELECT is((SELECT total_points || '/' || best_streak || '/' || rank_position FROM pg_temp.row_of('pf-2', (SELECT pa FROM pf_ids))),
          '1/1/2', 'fase A: pf-2 1 punto, racha 1, segundo');
SELECT is((SELECT count(*) FROM pg_temp.row_of('pf-3', (SELECT pa FROM pf_ids))), 0::bigint,
          'fase A: pf-3 (empezó en B) no aparece');

-- ---------------- Fase B ----------------
SELECT is((SELECT total_points || '/' || best_streak || '/' || current_streak FROM pg_temp.row_of('pf-2', (SELECT pb FROM pf_ids))),
          '2/2/0', 'fase B: pf-2 2 puntos, mejor racha 2, actual 0');
SELECT is((SELECT total_points || '/' || rank_position FROM pg_temp.row_of('pf-1', (SELECT pb FROM pf_ids))),
          '0/3', 'fase B: pf-1 0 puntos, último');
SELECT is((SELECT total_points FROM pg_temp.row_of('pf-3', (SELECT pb FROM pf_ids))), 1::bigint,
          'fase B: pf-3 aparece con su acierto');
SELECT is((SELECT count(*) FROM lol_standings_at((SELECT e FROM pf_ids), NULL, NULL, -1)), 0::bigint,
          'fase inexistente: vacía');

-- ---------------- General = suma de fases ----------------
SELECT is_empty($$
  SELECT g.profile_id
  FROM lol_standings_at((SELECT e FROM pf_ids), NULL, NULL, NULL) g
  WHERE g.total_points <> (
    SELECT COALESCE(SUM(f.total_points), 0)
    FROM (VALUES ((SELECT pa FROM pf_ids)), ((SELECT pb FROM pf_ids))) ph(id)
    CROSS JOIN LATERAL lol_standings_at((SELECT e FROM pf_ids), NULL, NULL, ph.id) f
    WHERE f.profile_id = g.profile_id)
$$, 'puntos de la general = suma de los de cada fase');

-- ---------------- Pool ----------------
SELECT is((SELECT string_agg(p.nickname || ':' || s.total_points, ',' ORDER BY s.rank_position)
           FROM lol_standings_at((SELECT e FROM pf_ids), (SELECT pool FROM pf_ids), NULL, (SELECT pb FROM pf_ids)) s
           JOIN profiles p ON p.id = s.profile_id),
          'pf-3:1,pf-1:0', 'pool + fase B: solo sus miembros');

-- ---------------- get_lol_standings ----------------
SELECT is(t.run_as('authenticated', t.uid('pf-1'),
          format('SELECT string_agg(nickname || '':'' || rank_position || '':'' || COALESCE(movement::text, ''-''), '','' ORDER BY rank_position) FROM get_lol_standings(%s, NULL, %s)',
                 (SELECT e FROM pf_ids), (SELECT pb FROM pf_ids))),
          'pf-2:1:0,pf-3:2:0,pf-1:3:0',
          'get_lol_standings con fase: clasificación de B y movimiento respecto a la jornada anterior de B');
SELECT is(t.run_as('authenticated', t.uid('pf-1'),
          format('SELECT string_agg(nickname, '','' ORDER BY rank_position) FROM get_lol_standings(%s)', (SELECT e FROM pf_ids))),
          'pf-1,pf-2,pf-3', 'get_lol_standings sin fase: la general');
SELECT ok(has_function_privilege('authenticated', 'get_lol_standings(integer,integer,integer)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'get_lol_standings(integer,integer,integer)', 'EXECUTE'),
          'get_lol_standings: authenticated sí, anon no');
SELECT ok(NOT has_function_privilege('authenticated', 'lol_standings_at(integer,integer,date,integer)', 'EXECUTE'),
          'lol_standings_at con fase: sin EXECUTE directo');
SELECT ok(to_regprocedure('get_lol_standings(integer,integer)') IS NULL, 'ya no existe la de 2 argumentos');

SELECT * FROM finish();
ROLLBACK;
