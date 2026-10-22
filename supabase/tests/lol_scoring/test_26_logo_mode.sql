-- Modo del logo (20261027100001_team_logo_mode): teams.logo_mode,
-- admin_set_lol_team_logo con p_logo_mode y admin_set_lol_team_logo_mode.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(22);

DO $$
BEGIN
  PERFORM t.player('lm-admin', p_role => 'ADMIN');
  PERFORM t.player('lm-user');
  PERFORM t.team('LMA');
  PERFORM t.team('LMB');
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
    ('team-logos', '1111111111111111.png', '{}'::jsonb),
    ('team-logos', '2222222222222222.png', '{}'::jsonb);
END;
$$;

CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;
CREATE FUNCTION pg_temp.url(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'http://localhost:54399/storage/v1/object/public/team-logos/' || p_name;
$$;
CREATE FUNCTION pg_temp.tid(p_tag text) RETURNS integer LANGUAGE sql AS $$
  SELECT id FROM teams WHERE slug = 'lol-test-' || lower(p_tag);
$$;
CREATE FUNCTION pg_temp.mode(p_tag text) RETURNS text LANGUAGE sql AS $$
  SELECT logo_mode FROM teams WHERE id = pg_temp.tid(p_tag);
$$;
CREATE FUNCTION pg_temp.last(p_tag text) RETURNS text LANGUAGE sql AS $$
  SELECT action || ' ' || coalesce(before ->> 'logo_mode', '-') || '>' || coalesce(after ->> 'logo_mode', '-')
  FROM lol_admin_audit WHERE team_id = pg_temp.tid(p_tag) ORDER BY id DESC LIMIT 1;
$$;

-- ---------------- Columna ----------------
SELECT is(pg_temp.mode('LMA'), 'color', 'por defecto, color (como hasta ahora)');
SELECT throws_ok($$ UPDATE teams SET logo_mode = 'neon' WHERE id = pg_temp.tid('LMA') $$,
                 '23514', NULL, 'CHECK: solo color, mono o plate');
SELECT throws_ok($$ UPDATE teams SET logo_mode = NULL WHERE id = pg_temp.tid('LMA') $$,
                 '23502', NULL, 'NOT NULL');

-- ---------------- admin_set_lol_team_logo con modo ----------------
SELECT is(pg_temp.u('lm-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L, NULL, %L)',
                                       pg_temp.tid('LMA'), pg_temp.url('1111111111111111.png'), 'MONO ')),
          '1', 'un ADMIN pone el logo con su modo');
SELECT is(pg_temp.mode('LMA'), 'mono', 'el modo queda guardado limpio');
SELECT is(pg_temp.last('LMA'), 'set_team_logo color>mono', 'queda registrado el modo antes y después');
SELECT is(pg_temp.u('lm-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('LMB'), pg_temp.url('1111111111111111.png'))),
          '1', 'sin modo, sigue funcionando la llamada de antes');
SELECT is(pg_temp.mode('LMB'), 'color', 'y el modo es color');
SELECT is(pg_temp.u('lm-admin', format('SELECT previous_object IS NULL FROM admin_set_lol_team_logo(%s, %L, NULL, %L)',
                                       pg_temp.tid('LMA'), pg_temp.url('1111111111111111.png'), 'plate')),
          'true', 'mismo archivo con otro modo: no devuelve anterior que borrar');
SELECT is(pg_temp.last('LMA'), 'set_team_logo_mode mono>plate', 'se registra como cambio de modo');
SELECT is(pg_temp.u('lm-admin', format('SELECT previous_object || '' '' || previous_in_use FROM admin_set_lol_team_logo(%s, %L, NULL, %L)',
                                       pg_temp.tid('LMA'), pg_temp.url('2222222222222222.png'), 'mono')),
          '1111111111111111.png true', 'archivo nuevo: devuelve el anterior como siempre');
SELECT is(pg_temp.u('lm-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L, NULL, %L)',
                                       pg_temp.tid('LMA'), pg_temp.url('2222222222222222.png'), 'neon')),
          '22023: El modo del logo debe ser color, mono o plate', 'modo no válido');
SELECT is(pg_temp.u('lm-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, NULL, NULL, %L)',
                                       pg_temp.tid('LMA'), 'mono')),
          '1', 'quitar el logo');
SELECT is(pg_temp.mode('LMA'), 'color', 'sin logo, el modo vuelve a color');
SELECT is(pg_temp.last('LMA'), 'remove_team_logo mono>color', 'y queda registrado');

-- ---------------- admin_set_lol_team_logo_mode ----------------
SELECT is(pg_temp.u('lm-admin', format('SELECT admin_set_lol_team_logo_mode(%s, %L)', pg_temp.tid('LMA'), 'mono')),
          '22023: El equipo no tiene logo', 'sin logo no hay modo que cambiar');
SELECT is(pg_temp.u('lm-admin', format('SELECT admin_set_lol_team_logo_mode(%s, %L)', pg_temp.tid('LMB'), 'plate')),
          'ok', 'un ADMIN cambia solo el modo');
SELECT is(pg_temp.last('LMB'), 'set_team_logo_mode color>plate', 'queda registrado');
SELECT is(pg_temp.u('lm-admin', format('SELECT admin_set_lol_team_logo_mode(%s, %L)', pg_temp.tid('LMB'), 'neon')),
          '22023: El modo del logo debe ser color, mono o plate', 'modo no válido');
SELECT is(pg_temp.u('lm-user', format('SELECT admin_set_lol_team_logo_mode(%s, %L)', pg_temp.tid('LMB'), 'mono')),
          '42501: Solo un administrador puede hacer esto', 'un USER no cambia el modo');
SELECT alike(t.run_as('anon', NULL, format('SELECT admin_set_lol_team_logo_mode(%s, %L)', pg_temp.tid('LMB'), 'mono')),
             '42501: permission denied for function admin_set_lol_team_logo_mode%', 'anon tampoco');
SELECT is(pg_temp.mode('LMB'), 'plate', 'el modo no ha cambiado');

SELECT * FROM finish();
ROLLBACK;
