-- Centro de operaciones del admin: crear / editar / cancelar series,
-- resultado, partido de la jornada, panel "Hoy", participación,
-- autorización y auditoría (lol_admin_audit).
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(62);

DO $$
DECLARE
  e    integer := t.edition('admin ops');
  ph   integer := t.phase(e, t.ruleset('ops v2', t.cfg_v2(3)), 'Swiss', 0);           -- corte 0
  ph60 integer := t.phase(e, (SELECT id FROM rulesets WHERE name = 'LoL Series (default)'), 'Fase corte 60', 1);
  fph  integer := (SELECT ph2.id FROM phases ph2 JOIN editions e2 ON e2.id = ph2.edition_id
                   JOIN competitions c ON c.id = e2.competition_id WHERE c.slug = 'fifa-world-cup' LIMIT 1);
  d    timestamptz := date_trunc('day', now() + interval '3 days') + interval '12 hours';
BEGIN
  PERFORM t.team('AAA'); PERFORM t.team('BBB'); PERFORM t.team('CCC'); PERFORM t.team('DDD');
  -- Equipo de fútbol con sigla propia: no vale para LoL.
  INSERT INTO teams (sport_id, slug, name, iso_code)
  SELECT id, 'fb-test-zzz', 'Fútbol ZZZ', 'ZZZ' FROM sports WHERE slug = 'football';
  PERFORM t.player('ops-admin', p_role => 'ADMIN');
  PERFORM t.player('ops-user');
  PERFORM t.player('ops-hidden', p_hidden => true);
  CREATE TEMP TABLE ctx AS SELECT e, ph, ph60, fph, d;
END;
$$;
GRANT SELECT ON ctx TO authenticated;

-- Atajo: crear como sesión SQL Editor
CREATE FUNCTION pg_temp.mk(p_home text, p_away text, p_date timestamptz, p_bo integer DEFAULT 3,
                           p_featured boolean DEFAULT false, p_phase integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT admin_create_lol_match(COALESCE(p_phase, (SELECT ph FROM ctx)), p_home, p_away, p_date, p_bo, p_featured, 'test');
$$;

-- ---------------- Crear: caso válido ----------------
CREATE TEMP TABLE m1 AS SELECT (pg_temp.mk('AAA', 'BBB', (SELECT d FROM ctx)) ->> 'match_id')::integer AS id;
SELECT ok((SELECT id FROM m1) IS NOT NULL, 'crear: devuelve match_id');
SELECT results_eq($$ SELECT status::text, metadata ->> 'best_of', match_date FROM matches WHERE id = (SELECT id FROM m1) $$,
                  $$ VALUES ('PENDING', '3', (SELECT d FROM ctx)) $$, 'crear: PENDING, best_of en metadata, fecha en UTC');
SELECT results_eq($$ SELECT action, actor_kind, before IS NULL, after ->> 'home', reason FROM lol_admin_audit WHERE match_id = (SELECT id FROM m1) $$,
                  $$ VALUES ('create_match', 'sql', true, 'AAA', 'test') $$, 'crear: auditado (quién, antes, después)');
SELECT ok((SELECT pg_temp.mk('ccc', 'ddd', (SELECT d FROM ctx) + interval '1 hour') ->> 'match_id') IS NOT NULL,
          'crear: siglas sin distinguir mayúsculas');

-- ---------------- Crear: validaciones ----------------
SELECT throws_like($$ SELECT admin_create_lol_match(999999, 'AAA', 'BBB', (SELECT d FROM ctx), 3) $$,
                   '%no existe o no es de LoL%', 'fase inexistente');
SELECT throws_like($$ SELECT admin_create_lol_match((SELECT fph FROM ctx), 'AAA', 'BBB', (SELECT d FROM ctx), 3) $$,
                   '%no existe o no es de LoL%', 'fase de otro deporte');
SELECT throws_like($$ SELECT pg_temp.mk('QQQ', 'BBB', (SELECT d FROM ctx)) $$, '%ningún equipo de LoL con la sigla "QQQ"%', 'sigla inexistente');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'ZZZ', (SELECT d FROM ctx)) $$, '%ningún equipo de LoL con la sigla "ZZZ"%', 'sigla de otro deporte');
SELECT throws_like($$ SELECT pg_temp.mk(' ', 'BBB', (SELECT d FROM ctx)) $$, '%Falta la sigla del equipo A%', 'sigla vacía');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'aaa', (SELECT d FROM ctx)) $$, '%el B son el mismo%', 'mismo equipo');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', (SELECT d FROM ctx) + interval '1 day', 2) $$, '%Bo1, Bo3 o Bo5 (recibido 2)%', 'best_of 2');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', (SELECT d FROM ctx) + interval '1 day', NULL) $$, '%Bo1, Bo3 o Bo5%', 'best_of vacío');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', NULL) $$, '%Falta la fecha%', 'sin fecha');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', now() - interval '1 hour') $$, '%la votación ya estaría cerrada%', 'fecha pasada');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', now() + interval '30 minutes', 3, false, (SELECT ph60 FROM ctx)) $$,
                   '%ya estaría cerrada (corte de la fase: 60 min)%', 'dentro del corte de la fase (60 min)');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'BBB', (SELECT d FROM ctx)) $$, '%Ya existe AAA vs BBB a esa hora%', 'duplicado exacto');
SELECT throws_like($$ SELECT pg_temp.mk('BBB', 'AAA', (SELECT d FROM ctx)) $$, '%Ya existe BBB vs AAA a esa hora%', 'duplicado con local y visitante cambiados');
SELECT is(jsonb_array_length(pg_temp.mk('AAA', 'BBB', (SELECT d FROM ctx) + interval '2 days') -> 'warnings'), 1,
          'mismo cruce en otra fecha: se crea con aviso (revancha)');
SELECT is((SELECT COUNT(*) FROM matches m JOIN phases p ON p.id = m.phase_id WHERE p.edition_id = (SELECT e FROM ctx)), 3::bigint,
          'ningún intento fallido ha dejado series a medias');

-- Partido de la jornada (lo valida el trigger existente)
SELECT ok((pg_temp.mk('CCC', 'DDD', (SELECT d FROM ctx) + interval '1 day', 1, true) ->> 'match_id') IS NOT NULL,
          'crear como partido de la jornada');
SELECT throws_like($$ SELECT pg_temp.mk('AAA', 'DDD', (SELECT d FROM ctx) + interval '1 day 1 hour', 1, true) $$,
                   '%Ya hay un partido de la jornada%', 'segundo partido de la jornada el mismo día');
SELECT is((SELECT COUNT(*) FROM matches m JOIN phases p ON p.id = m.phase_id
           WHERE p.edition_id = (SELECT e FROM ctx) AND m.home_team_id = t.team('AAA') AND m.away_team_id = t.team('DDD')), 0::bigint,
          'el rechazo del partido de la jornada no deja la serie creada');

-- ---------------- Autorización ----------------
CREATE TEMP TABLE q AS SELECT format('SELECT admin_create_lol_match(%s, %L, %L, %L, 3)', (SELECT ph FROM ctx), 'AAA', 'CCC',
                                     (SELECT d FROM ctx) + interval '5 days') AS sql;
GRANT SELECT ON q TO anon, authenticated, service_role;
SELECT alike(t.run_as('anon', NULL, (SELECT sql FROM q)), '42501: permission denied for function admin_create_lol_match%', 'anon no puede crear');
SELECT is(t.run_as('authenticated', t.uid('ops-user'), (SELECT sql FROM q)), '42501: Solo un administrador puede hacer esto',
          'authenticated normal no puede crear');
SELECT alike(t.run_as('service_role', NULL, (SELECT sql FROM q)), '42501:%', 'service_role no puede crear (sin autor)');
SELECT alike(t.run_as('anon', NULL, 'SELECT admin_lol_ops_today()'), '42501: permission denied%', 'anon no ve el panel Hoy');
SELECT is(t.run_as('authenticated', t.uid('ops-user'), 'SELECT admin_lol_ops_today()'), '42501: Solo un administrador puede hacer esto',
          'authenticated normal no ve el panel Hoy');
SELECT is(t.run_as('authenticated', t.uid('ops-user'), format('SELECT count(*) FROM admin_lol_match_participation(%s)', (SELECT id FROM m1))),
          '42501: Solo un administrador puede hacer esto', 'authenticated normal no ve la participación');
SELECT alike(t.run_as('authenticated', t.uid('ops-user'), format('SELECT admin_set_lol_match_status(%s, %L)', (SELECT id FROM m1), 'CANCELLED')),
             '42501:%', 'authenticated normal no puede cancelar');
SELECT ok(t.run_as('authenticated', t.uid('ops-admin'), (SELECT sql FROM q)) LIKE '{"match_id": %', 'ADMIN crea desde la app');
SELECT results_eq($$ SELECT actor_id, actor_kind FROM lol_admin_audit ORDER BY id DESC LIMIT 1 $$,
                  $$ VALUES (t.uid('ops-admin'), 'admin') $$, 'auditoría con el ADMIN como autor');
SELECT is(t.run_as('authenticated', t.uid('ops-user'), 'SELECT count(*) FROM lol_admin_audit'), '0', 'usuario normal no lee la auditoría');
SELECT isnt(t.run_as('authenticated', t.uid('ops-admin'), 'SELECT count(*) FROM lol_admin_audit'), '0', 'ADMIN lee la auditoría');
SELECT alike(t.run_as('authenticated', t.uid('ops-admin'), 'DELETE FROM lol_admin_audit'), '42501:%', 'nadie borra la auditoría desde la API');

-- ---------------- Editar ----------------
SELECT lives_ok($$ SELECT admin_update_lol_match((SELECT id FROM m1), (SELECT d FROM ctx) + interval '30 minutes') $$,
                'editar hora sin votos');
SELECT results_eq($$ SELECT action, (before ->> 'match_date')::timestamptz, (after ->> 'match_date')::timestamptz
                     FROM lol_admin_audit WHERE match_id = (SELECT id FROM m1) ORDER BY id DESC LIMIT 1 $$,
                  $$ VALUES ('update_match', (SELECT d FROM ctx), (SELECT d FROM ctx) + interval '30 minutes') $$,
                  'editar: auditado con antes y después');
SELECT throws_like($$ SELECT admin_update_lol_match((SELECT id FROM m1)) $$, '%No hay cambios%', 'editar sin cambios');
SELECT lives_ok($$ SELECT admin_update_lol_match((SELECT id FROM m1), NULL, 5) $$, 'cambiar best_of sin votos');
SELECT is((SELECT metadata ->> 'best_of' FROM matches WHERE id = (SELECT id FROM m1)), '5', 'best_of actualizado en metadata');

SELECT t.vote(t.uid('ops-user'), (SELECT id FROM m1), 3, 1);
SELECT throws_ok($$ SELECT admin_update_lol_match((SELECT id FROM m1), (SELECT d FROM ctx) + interval '1 hour') $$,
                 '55000', 'La serie ya tiene 1 voto(s). Confirma para cambiar la hora; los votos se mantienen.',
                 'con votos: pide confirmación');
SELECT lives_ok($$ SELECT admin_update_lol_match((SELECT id FROM m1), (SELECT d FROM ctx) + interval '1 hour', NULL, true) $$,
                'con votos y confirmación: cambia la hora');
SELECT is((SELECT COUNT(*) FROM predictions WHERE match_id = (SELECT id FROM m1)), 1::bigint, 'los votos se conservan');
SELECT throws_like($$ SELECT admin_update_lol_match((SELECT id FROM m1), NULL, 3, true) $$,
                   '%No se puede cambiar de Bo5 a Bo3 con 1 voto(s)%', 'con votos no se cambia el best_of');
SELECT throws_like($$ SELECT admin_update_lol_match((SELECT id FROM m1), now() - interval '1 hour', NULL, true) $$,
                   '%la votación ya estaría cerrada%', 'no se puede mover al pasado');

-- ---------------- Cancelar / reabrir / resultado ----------------
-- Serie ya jugada (creada en el pasado a mano, como las del seed)
CREATE TEMP TABLE past AS SELECT t.match((SELECT ph FROM ctx), now() - interval '2 hours', 3, 'AAA', 'CCC') AS id;
SELECT t.vote(t.uid('ops-user'), (SELECT id FROM past), 2, 0);
SELECT throws_like($$ SELECT admin_update_lol_match((SELECT id FROM past), (SELECT d FROM ctx)) $$,
                   '%votación todavía abierta%', 'no se edita una serie con la votación cerrada');
SELECT throws_like($$ SELECT admin_set_lol_match_result((SELECT id FROM past), 3, 0) $$, '%no es un resultado válido para un Bo3%',
                   'resultado imposible para el formato');
SELECT lives_ok($$ SELECT admin_set_lol_match_result((SELECT id FROM past), 2, 1) $$, 'resultado válido');
SELECT results_eq($$ SELECT status::text, home_goals, away_goals FROM matches WHERE id = (SELECT id FROM past) $$,
                  $$ VALUES ('FINISHED', 2, 1) $$, 'resultado guardado');
SELECT ok(t.pts(t.uid('ops-user'), (SELECT id FROM past)) > 0, 'resultado puntuado por el motor');
SELECT lives_ok($$ SELECT admin_set_lol_match_status((SELECT id FROM past), 'CANCELLED', 'aplazada') $$, 'cancelar');
SELECT results_eq($$ SELECT m.status::text, m.home_goals IS NULL, pr.points_earned::integer
                     FROM matches m JOIN predictions pr ON pr.match_id = m.id WHERE m.id = (SELECT id FROM past) $$,
                  $$ VALUES ('CANCELLED', true, 0) $$, 'cancelada (no borrada): sin resultado y puntos a 0');
SELECT throws_like($$ SELECT admin_set_lol_match_status((SELECT id FROM past), 'CANCELLED') $$, '%ya está en estado CANCELLED%', 'cancelar dos veces');
SELECT throws_like($$ SELECT admin_set_lol_match_result((SELECT id FROM past), 2, 1) $$, '%está cancelada%', 'resultado en serie cancelada');
SELECT throws_like($$ SELECT admin_set_lol_match_status((SELECT id FROM past), 'FINISHED') $$, '%Estado no permitido%', 'estado no permitido');
SELECT results_eq($$ SELECT array_agg(action ORDER BY id) FROM lol_admin_audit WHERE match_id = (SELECT id FROM past) $$,
                  $$ VALUES (ARRAY['set_result', 'cancel_match']) $$, 'resultado y cancelación auditados');
SELECT lives_ok($$ SELECT admin_set_lol_match_status((SELECT id FROM past), 'PENDING') $$, 'reabrir');

-- ---------------- Panel "Hoy" y participación ----------------
-- La edición de test no está "activa" (fechas fijas): se activa para el panel.
UPDATE editions SET start_date = current_date - 1, end_date = current_date + 10 WHERE id = (SELECT e FROM ctx);
CREATE TEMP TABLE today AS SELECT t.run_as('authenticated', t.uid('ops-admin'), 'SELECT admin_lol_ops_today()')::jsonb AS j;
SELECT ok((SELECT j -> 'open' @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM m1))) FROM today),
          'Hoy: la serie con votación abierta aparece en "open"');
SELECT ok((SELECT j -> 'needs_result' @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM past))) FROM today),
          'Hoy: la serie pasada sin resultado aparece en "needs_result"');
SELECT ok((SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'open_days') od
                          WHERE od -> 'blocking' @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM past))))
           FROM today), 'Hoy: la jornada sigue abierta por la serie pendiente');
SELECT ok((SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'editions') ed, jsonb_array_elements(ed -> 'phases') p
                          WHERE p ->> 'name' = 'Swiss' AND (p ->> 'version')::integer = 2 AND (p ->> 'current')::boolean)
           FROM today), 'Hoy: fase activa con su ruleset v2');

SELECT t.vote(t.uid('ops-hidden'), (SELECT id FROM m1), 3, 0);
SELECT is(t.run_as('authenticated', t.uid('ops-admin'),
          format('SELECT string_agg(nickname || ''='' || has_voted, '','' ORDER BY nickname) FROM admin_lol_match_participation(%s)', (SELECT id FROM m1))),
          'ops-user=true', 'participación: votó sí/no, sin ocultos');
SELECT is(pg_get_function_result('admin_lol_match_participation(integer)'::regprocedure),
          'TABLE(profile_id uuid, nickname text, has_voted boolean)', 'participación: nunca devuelve el voto');

SELECT * FROM finish();
ROLLBACK;
