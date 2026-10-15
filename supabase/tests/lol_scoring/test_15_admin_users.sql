-- Admin de usuarios: listado con correo, registro de acciones y
-- límite de intentos (20261017100001_admin_users).
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(34);

DO $$
DECLARE
  v_club integer;
BEGIN
  PERFORM t.player('usr-admin',  p_role => 'ADMIN');
  PERFORM t.player('usr-admin2', p_role => 'ADMIN');
  PERFORM t.player('usr-user');
  PERFORM t.player('usr-hidden', p_hidden => true);

  UPDATE auth.users SET email = 'admin@fake.local' WHERE id = t.uid('usr-admin');
  UPDATE auth.users SET email = 'user@fake.local',
                        last_sign_in_at = TIMESTAMPTZ '2026-10-01 10:00+00',
                        raw_app_meta_data = '{"provider": "email", "must_change_password": true}'
  WHERE id = t.uid('usr-user');

  INSERT INTO clubs (name, join_code, created_by) VALUES ('usr club B', 'USRB01', t.uid('usr-user')) RETURNING id INTO v_club;
  INSERT INTO club_members (club_id, profile_id, role) VALUES (v_club, t.uid('usr-user'), 'owner');
  INSERT INTO clubs (name, join_code, created_by) VALUES ('usr club A', 'USRA01', t.uid('usr-user')) RETURNING id INTO v_club;
  INSERT INTO club_members (club_id, profile_id, role) VALUES (v_club, t.uid('usr-user'), 'member');
END;
$$;

CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;
CREATE FUNCTION pg_temp.begin_sql(p_nick text, p_action text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT admin_user_action_begin(%L, %L)', t.uid(p_nick), p_action);
$$;


-- ============================================================
--  admin_list_users
-- ============================================================

SELECT alike(t.run_as('anon', NULL, 'SELECT count(*) FROM admin_list_users()'),
             '42501: permission denied%', 'anon no ejecuta admin_list_users');
SELECT alike(pg_temp.u('usr-user', 'SELECT count(*) FROM admin_list_users()'),
             '42501: %', 'un USER no ejecuta admin_list_users');
SELECT is(pg_temp.u('usr-admin', $q$SELECT email FROM admin_list_users() WHERE nickname = 'usr-user'$q$),
          'user@fake.local', 'ADMIN ve el correo de auth.users');
SELECT is(pg_temp.u('usr-admin', $q$SELECT array_to_string(clubs, '|') FROM admin_list_users() WHERE nickname = 'usr-user'$q$),
          'usr club A|usr club B', 'clubs del usuario, ordenados');
SELECT is(pg_temp.u('usr-admin', $q$SELECT last_sign_in_at::text FROM admin_list_users() WHERE nickname = 'usr-user'$q$),
          (TIMESTAMPTZ '2026-10-01 10:00+00')::text, 'último acceso de auth.users');
SELECT is(pg_temp.u('usr-admin', $q$SELECT must_change_password::text FROM admin_list_users() WHERE nickname = 'usr-user'$q$),
          'true', 'must_change_password desde app_metadata');
SELECT is(pg_temp.u('usr-admin', $q$SELECT must_change_password::text || role || is_hidden::text FROM admin_list_users() WHERE nickname = 'usr-hidden'$q$),
          'falseUSERtrue', 'sin flag: false; rol y oculto');
SELECT is(pg_temp.u('usr-admin', $q$SELECT count(*) FROM admin_list_users() WHERE nickname LIKE 'usr-%'$q$),
          '4', 'incluye ocultos y admins');


-- ============================================================
--  admin_user_action_begin: quién puede y qué
-- ============================================================

SELECT alike(t.run_as('anon', NULL, pg_temp.begin_sql('usr-user', 'user_hide')),
             '42501: permission denied%', 'anon no ejecuta begin');
SELECT alike(pg_temp.u('usr-user', pg_temp.begin_sql('usr-hidden', 'user_show')),
             '42501: %', 'un USER no registra acciones de admin');
SELECT alike(t.run_as('service_role', NULL, pg_temp.begin_sql('usr-user', 'user_hide')),
             '42501: %', 'service_role tampoco: el registro necesita autor');
SELECT alike(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-admin', 'user_password_reset')),
             '42501: No puedes reiniciar tu propia contraseña%', 'un admin no se reinicia a sí mismo');
SELECT alike(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-admin2', 'user_password_reset')),
             '42501: No se puede reiniciar la contraseña de otro administrador%', 'un admin no reinicia a otro ADMIN');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE target_profile_id = t.uid('usr-admin2')), 0::bigint,
          'el intento rechazado no deja registro ni gasta intentos');
SELECT alike(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-user', 'user_set_role')),
             '22023: %', 'acción desconocida (p. ej. cambiar rol) rechazada');
SELECT alike(pg_temp.u('usr-admin', format('SELECT admin_user_action_begin(%L, %L)', gen_random_uuid(), 'user_hide')),
             'P0002: %', 'usuario inexistente');
SELECT isnt(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-admin', 'user_hide')) ~ '^[0-9A-Z]{5}: ', true,
            'ocultarse a sí mismo sí se permite (como en /admin/jugadores)');


-- ============================================================
--  Registro: quién, a quién, cuándo; sin contraseña
-- ============================================================

CREATE TEMP TABLE ids AS
SELECT pg_temp.u('usr-admin', pg_temp.begin_sql('usr-user', 'user_password_reset'))::bigint AS reset_id;
GRANT SELECT ON ids TO authenticated;

SELECT is((SELECT actor_id FROM lol_admin_audit WHERE id = (SELECT reset_id FROM ids)), t.uid('usr-admin'), 'actor = admin');
SELECT is((SELECT target_profile_id FROM lol_admin_audit WHERE id = (SELECT reset_id FROM ids)), t.uid('usr-user'), 'destino = usuario');
SELECT is((SELECT actor_kind || ' ' || action || ' ' || (after ->> 'status') FROM lol_admin_audit WHERE id = (SELECT reset_id FROM ids)),
          'admin user_password_reset started', 'acción y estado inicial');
SELECT ok((SELECT created_at IS NOT NULL AND before IS NULL AND reason IS NULL FROM lol_admin_audit WHERE id = (SELECT reset_id FROM ids)),
          'fecha; nada más guardado');

SELECT alike(pg_temp.u('usr-admin2', format('SELECT admin_user_action_end(%s, true)', (SELECT reset_id FROM ids))),
             'P0002: %', 'otro admin no cierra un registro ajeno');
SELECT is(pg_temp.u('usr-admin', format('SELECT admin_user_action_end(%s, true)', (SELECT reset_id FROM ids))),
          'ok', 'el autor anota el resultado');
SELECT is((SELECT after FROM lol_admin_audit WHERE id = (SELECT reset_id FROM ids)), '{"status": "ok"}'::jsonb, 'resultado ok, sin más datos');
SELECT alike(pg_temp.u('usr-admin', format('SELECT admin_user_action_end(%s, false, %L)', (SELECT reset_id FROM ids), 'x')),
             'P0002: %', 'el resultado no se reescribe');

SELECT is(pg_temp.u('usr-admin',
            format('SELECT admin_user_action_end(%s, false, %L)',
                   pg_temp.u('usr-admin', pg_temp.begin_sql('usr-user', 'user_hide')), repeat('e', 400))),
          'ok', 'fallo anotado');
SELECT is((SELECT (after ->> 'status') || ' ' || length(after ->> 'error') FROM lol_admin_audit
           WHERE actor_id = t.uid('usr-admin') AND action = 'user_hide' AND target_profile_id = t.uid('usr-user')),
          'error 300', 'error recortado a 300 caracteres');


-- ============================================================
--  Tabla de auditoría: sin escritura directa, lectura solo ADMIN
-- ============================================================

SELECT alike(pg_temp.u('usr-admin',
               format('INSERT INTO lol_admin_audit (actor_id, actor_kind, action) VALUES (%L, %L, %L)', t.uid('usr-admin'), 'admin', 'x')),
             '42501: permission denied%', 'ni un ADMIN escribe directamente en lol_admin_audit');
SELECT is(pg_temp.u('usr-user', 'SELECT count(*) FROM lol_admin_audit'), '0', 'un USER no lee la auditoría');
SELECT isnt(pg_temp.u('usr-admin', 'SELECT count(*) FROM lol_admin_audit WHERE target_profile_id IS NOT NULL'), '0',
            'un ADMIN sí la lee');


-- ============================================================
--  Límite de intentos: 5 reinicios cada 10 minutos por admin
-- ============================================================

-- Ya hay 1 reinicio de usr-admin; 4 más llegan al límite.
SELECT is((SELECT count(*) FROM generate_series(1, 4) g
           WHERE pg_temp.u('usr-admin', pg_temp.begin_sql('usr-user', 'user_password_reset')) ~ '^\d+$'),
          4::bigint, 'hasta 5 reinicios');
SELECT alike(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-hidden', 'user_password_reset')),
             'WR429: Demasiados intentos%', 'el sexto se rechaza');
SELECT ok(pg_temp.u('usr-admin2', pg_temp.begin_sql('usr-user', 'user_password_reset')) ~ '^\d+$',
          'el límite es por admin');
SELECT ok(pg_temp.u('usr-admin', pg_temp.begin_sql('usr-user', 'user_show')) ~ '^\d+$',
          'y por acción');

SELECT * FROM finish();
ROLLBACK;
