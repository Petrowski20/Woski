-- Votos de una serie para la pestaña Predicciones del admin
-- (20261018100001_admin_lol_match_votes): quién votó, qué y cuándo,
-- también con la votación abierta; solo ADMIN o sesión SQL.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(17);

DO $$
DECLARE
  e  integer := t.edition('match votes');
  ph integer := t.phase(e, t.ruleset('votes v2', t.cfg_v2(3)), 'Swiss', 0);
  mo integer := t.match(ph, now() + interval '3 days', 3, 'AAA', 'BBB');   -- votación abierta
  mf integer := t.match(ph, now() - interval '3 days', 3, 'CCC', 'DDD');   -- terminará
BEGIN
  PERFORM t.player('mv-admin', p_role => 'ADMIN');
  PERFORM t.player('mv-ana');
  PERFORM t.player('mv-bea');
  PERFORM t.player('mv-hidden', p_hidden => true);
  PERFORM t.player('mv-hidden-novote', p_hidden => true);
  PERFORM t.player('mv-outsider');   -- sin votos ni pools en la edición

  PERFORM t.vote(t.uid('mv-ana'), mo, 2, 1);
  PERFORM t.vote(t.uid('mv-hidden'), mo, 0, 2);
  -- bea participa (votó otra serie de la edición) pero no la abierta
  PERFORM t.vote(t.uid('mv-bea'), mf, 2, 0);
  PERFORM t.vote(t.uid('mv-ana'), mf, 2, 1);
  PERFORM t.finish(mf, 2, 0);
  PERFORM score_lol_match(mf);
  CREATE TEMP TABLE ctx AS SELECT e, mo, mf;
END;
$$;
GRANT SELECT ON ctx TO authenticated;

CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;

-- ---------------- Contenido ----------------
SELECT results_eq(
  $$ SELECT nickname, has_voted, pred_home, pred_away, is_hidden FROM admin_lol_match_votes((SELECT mo FROM ctx)) $$,
  $$ VALUES ('mv-ana', true, 2, 1, false), ('mv-hidden', true, 0, 2, true), ('mv-bea', false, NULL::integer, NULL::integer, false) $$,
  'serie abierta: primero quienes votaron (con su voto), luego quienes faltan');
SELECT is((SELECT pred_winner_id FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-ana'),
          (SELECT pred_winner_id FROM predictions WHERE profile_id = t.uid('mv-ana') AND match_id = (SELECT mo FROM ctx)),
          'devuelve el ganador guardado');
SELECT ok((SELECT saved_at IS NOT NULL FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-ana'),
          'devuelve la hora de guardado');
SELECT is((SELECT count(*) FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-hidden-novote'), 0::bigint,
          'un oculto sin voto no aparece');
SELECT is((SELECT count(*) FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-outsider'), 0::bigint,
          'quien no participa en la edición no aparece');
SELECT is((SELECT count(*) FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-admin'), 0::bigint,
          'el admin no aparece si no participa');
SELECT results_eq(
  $$ SELECT nickname, points_earned FROM admin_lol_match_votes((SELECT mf FROM ctx)) WHERE has_voted ORDER BY nickname $$,
  $$ SELECT p.nickname, pr.points_earned::integer FROM predictions pr JOIN profiles p ON p.id = pr.profile_id
     WHERE pr.match_id = (SELECT mf FROM ctx) ORDER BY p.nickname $$,
  'serie terminada: los puntos son los que guardó el motor');

-- Voto cargado a mano: marcado y con la nueva hora
SELECT lives_ok($$ SELECT admin_set_lol_prediction(t.uid('mv-bea'), (SELECT mo FROM ctx), NULL, 2, 0, 'test') $$,
                'carga manual (sesión SQL)');
SELECT results_eq(
  $$ SELECT has_voted, pred_home, pred_away, admin_entered FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-bea' $$,
  $$ VALUES (true, 2, 0, true) $$, 'el voto cargado a mano aparece marcado');
SELECT is((SELECT admin_entered FROM admin_lol_match_votes((SELECT mo FROM ctx)) WHERE nickname = 'mv-ana'), false,
          'un voto normal no aparece como cargado a mano');

-- ---------------- Errores ----------------
SELECT throws_like($$ SELECT * FROM admin_lol_match_votes(999999) $$, '%no existe o no es de LoL%', 'serie inexistente');

-- ---------------- Autorización ----------------
SELECT alike(t.run_as('anon', NULL, format('SELECT count(*) FROM admin_lol_match_votes(%s)', (SELECT mo FROM ctx))),
             '42501: permission denied for function admin_lol_match_votes%', 'anon no puede');
SELECT is(pg_temp.u('mv-ana', format('SELECT count(*) FROM admin_lol_match_votes(%s)', (SELECT mo FROM ctx))),
          '42501: Solo un administrador puede hacer esto', 'un jugador normal no ve los votos');
SELECT alike(t.run_as('service_role', NULL, format('SELECT count(*) FROM admin_lol_match_votes(%s)', (SELECT mo FROM ctx))),
             '42501:%', 'service_role tampoco (sin autor identificado)');
SELECT is(pg_temp.u('mv-admin', format('SELECT count(*) FROM admin_lol_match_votes(%s)', (SELECT mo FROM ctx))),
          '3', 'un ADMIN ve los votos de la serie abierta');
-- La RLS sigue ocultando los votos ajenos de la serie abierta fuera de la función.
SELECT is(pg_temp.u('mv-admin', format('SELECT count(*) FROM predictions WHERE match_id = %s', (SELECT mo FROM ctx))),
          '0', 'leyendo la tabla, el ADMIN sigue sin ver votos ajenos de una serie abierta');
SELECT is((SELECT provolatile FROM pg_proc WHERE proname = 'admin_lol_match_votes'), 's'::"char",
          'la función es de solo lectura (STABLE)');

SELECT * FROM finish();
ROLLBACK;
