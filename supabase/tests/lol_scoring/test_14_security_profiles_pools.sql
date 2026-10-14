-- Seguridad de profiles (S1), pools (S2) y agujeros de escritura
-- de la revisión de permisos: vistas de ranking, ranking_snapshots,
-- funciones SECURITY DEFINER abiertas.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(91);

DO $$
DECLARE
  e  integer := t.edition('security');
  ph integer := t.phase(e, t.ruleset('sec v2', t.cfg_v2(3)), 'Fase', 0);
  legacy integer;
  old_club integer;
  old_pool integer;
BEGIN
  PERFORM t.player('sec-user');
  PERFORM t.player('sec-other');
  PERFORM t.player('sec-admin', p_role => 'ADMIN');
  PERFORM t.player('sec-owner');
  PERFORM t.player('sec-member');
  PERFORM t.player('sec-outsider');
  PERFORM t.player('sec-legacy');
  PERFORM t.team('AAA'); PERFORM t.team('BBB');

  -- Liga antigua de /ligas: sin club, con código propio y un miembro.
  INSERT INTO pools (name, join_code, created_by) VALUES ('sec legacy', 'SECLEG', t.uid('sec-legacy'))
  RETURNING id INTO legacy;
  INSERT INTO pool_members (pool_id, profile_id, league_points) VALUES (legacy, t.uid('sec-legacy'), 7);

  -- Como los 4 pools antiguos: club del backfill con el mismo código.
  INSERT INTO clubs (name, join_code, created_by) VALUES ('sec old club', 'SECOLD', t.uid('sec-legacy'))
  RETURNING id INTO old_club;
  INSERT INTO club_members (club_id, profile_id, role) VALUES (old_club, t.uid('sec-legacy'), 'owner');
  INSERT INTO pools (name, join_code, created_by, club_id, edition_id) VALUES ('sec old pool', 'SECOLD', t.uid('sec-legacy'), old_club, e)
  RETURNING id INTO old_pool;

  CREATE TEMP TABLE ctx AS SELECT e, ph, legacy, old_club, old_pool;
END;
$$;
GRANT SELECT ON ctx TO anon, authenticated, service_role;

-- Ejecuta como usuario de la app (auth.uid() = el jugador).
CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;
-- Número de filas afectadas por una escritura.
CREATE FUNCTION pg_temp.n(p_dml text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('WITH w AS (%s RETURNING 1) SELECT count(*) FROM w', p_dml);
$$;


-- ============================================================
--  S1 — profiles
-- ============================================================

-- Privilegios finales
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'),
  'avatar_url,last_viewed_league_id,nickname', 'authenticated: UPDATE solo en nickname, avatar_url, last_viewed_league_id');
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated: sin INSERT ni DELETE');
SELECT ok(NOT has_table_privilege('anon', 'public.profiles', 'INSERT')
          AND NOT has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
          AND NOT has_table_privilege('anon', 'public.profiles', 'DELETE'), 'anon: sin INSERT, UPDATE ni DELETE');

-- Usuario normal: columnas privilegiadas, ni la suya
SELECT alike(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET %s WHERE id = %L', x, t.uid('sec-user')))),
             '42501: permission denied%', 'usuario no cambia su ' || x)
FROM unnest(ARRAY['role = ''ADMIN''', 'is_hidden = true', 'total_points = 9999',
                  'nickname = ''x'', role = ''ADMIN''']) x;
SELECT is((SELECT role::text || '/' || is_hidden || '/' || total_points FROM profiles WHERE id = t.uid('sec-user')),
          'USER/false/0', 'el perfil sigue intacto');

-- Sí sus columnas de perfil
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET nickname = %L WHERE id = %L', 'sec-user-2', t.uid('sec-user')))),
          '1', 'usuario cambia su nickname');
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET avatar_url = %L WHERE id = %L',
                    'https://x.supabase.co/storage/v1/object/public/avatars/a/avatar.png', t.uid('sec-user')))),
          '1', 'usuario cambia su avatar (ProfileManager)');
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET last_viewed_league_id = %s WHERE id = %L',
                    (SELECT legacy FROM ctx), t.uid('sec-user')))),
          '1', 'usuario cambia last_viewed_league_id (clasificación)');
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET last_viewed_league_id = NULL WHERE id = %L', t.uid('sec-user')))),
          '1', 'usuario vuelve a Global');
SELECT is((SELECT nickname || ' ' || avatar_url FROM profiles WHERE id = t.uid('sec-user')),
          'sec-user-2 https://x.supabase.co/storage/v1/object/public/avatars/a/avatar.png', 'los cambios se guardan');

-- Ni el perfil de otro
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET nickname = %L WHERE id = %L', 'robado', t.uid('sec-other')))),
          '0', 'usuario no toca el perfil de otro (RLS)');

-- INSERT / DELETE
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO profiles (id, nickname, role) VALUES (%L, %L, %L)', t.uid('sec-user'), 'dup', 'ADMIN')),
             '42501: permission denied%', 'usuario no inserta perfil con role ADMIN');
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO profiles (id, nickname, is_hidden, total_points) VALUES (%L, %L, true, 50)', gen_random_uuid(), 'nuevo')),
             '42501: permission denied%', 'usuario no inserta perfil con is_hidden/total_points');
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO profiles (id, nickname) VALUES (%L, %L)', gen_random_uuid(), 'nuevo')),
             '42501: permission denied%', 'usuario no inserta perfiles (el alta es de handle_new_user)');
SELECT alike(pg_temp.u('sec-user', format('DELETE FROM profiles WHERE id = %L', t.uid('sec-user'))),
             '42501: permission denied%', 'usuario no borra perfiles');

-- ADMIN de la app: tampoco por UPDATE directo
SELECT alike(pg_temp.u('sec-admin', pg_temp.n(format('UPDATE profiles SET role = ''ADMIN'' WHERE id = %L', t.uid('sec-user')))),
             '42501: permission denied%', 'ADMIN de la app no cambia roles por UPDATE');
SELECT alike(pg_temp.u('sec-admin', pg_temp.n(format('UPDATE profiles SET is_hidden = true WHERE id = %L', t.uid('sec-admin')))),
             '42501: permission denied%', 'ADMIN de la app no se oculta por UPDATE');

-- anon: nada
SELECT alike(t.run_as('anon', NULL, pg_temp.n(format('UPDATE profiles SET nickname = %L WHERE id = %L', 'anon', t.uid('sec-user')))),
             '42501: permission denied%', 'anon no actualiza perfiles');
SELECT alike(t.run_as('anon', NULL, format('INSERT INTO profiles (id, nickname) VALUES (%L, %L)', gen_random_uuid(), 'anon')),
             '42501: permission denied%', 'anon no inserta perfiles');
SELECT alike(t.run_as('anon', NULL, format('DELETE FROM profiles WHERE id = %L', t.uid('sec-user'))),
             '42501: permission denied%', 'anon no borra perfiles');

-- service_role (setPlayerHiddenAction, updatePlayerPredictionAction) y postgres (SQL Editor)
SELECT is(t.run_as('service_role', NULL, pg_temp.n(format('UPDATE profiles SET is_hidden = true WHERE id = %L', t.uid('sec-other')))),
          '1', 'service_role oculta jugadores (setPlayerHiddenAction)');
SELECT is(t.run_as('service_role', NULL, pg_temp.n(format('UPDATE profiles SET total_points = 12 WHERE id = %L', t.uid('sec-other')))),
          '1', 'service_role escribe total_points');
SELECT is(t.run_as('service_role', NULL, pg_temp.n(format('UPDATE profiles SET role = ''ADMIN'' WHERE id = %L', t.uid('sec-other')))),
          '1', 'service_role cambia el rol');
SELECT is(t.run_as(NULL, NULL, pg_temp.n(format('UPDATE profiles SET role = ''USER'', is_hidden = false, total_points = 0 WHERE id = %L', t.uid('sec-other')))),
          '1', 'postgres (SQL Editor) cambia rol, oculto y puntos');

-- Defensa en profundidad: aunque alguien vuelva a dar el privilegio, el trigger lo para.
GRANT UPDATE (role, is_hidden, total_points) ON profiles TO authenticated;
GRANT INSERT ON profiles TO authenticated;
CREATE POLICY sec_tmp_insert ON profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('UPDATE profiles SET %s WHERE id = %L', x, t.uid('sec-user')))),
          '42501: role, is_hidden y total_points no se pueden cambiar desde el cliente', 'trigger para el UPDATE de ' || x)
FROM unnest(ARRAY['role = ''ADMIN''', 'is_hidden = true', 'total_points = 9999']) x;
DELETE FROM auth.users WHERE id = md5('woski-test:sec-new')::uuid;
INSERT INTO auth.users (id) VALUES (md5('woski-test:sec-new')::uuid);
SELECT is(pg_temp.u('sec-new', format('INSERT INTO profiles (id, nickname, role) VALUES (%L, %L, %L)', t.uid('sec-new'), 'sec-new', 'ADMIN')),
          '42501: role, is_hidden y total_points no se pueden fijar desde el cliente', 'trigger para el INSERT con role ADMIN');
SELECT is(pg_temp.u('sec-new', format('INSERT INTO profiles (id, nickname, total_points) VALUES (%L, %L, 5)', t.uid('sec-new'), 'sec-new')),
          '42501: role, is_hidden y total_points no se pueden fijar desde el cliente', 'trigger para el INSERT con puntos');
SELECT is(pg_temp.u('sec-new', pg_temp.n(format('INSERT INTO profiles (id, nickname) VALUES (%L, %L)', t.uid('sec-new'), 'sec-new'))),
          '1', 'trigger deja el INSERT con valores por defecto');
DELETE FROM profiles WHERE id = t.uid('sec-new');
DROP POLICY sec_tmp_insert ON profiles;
REVOKE INSERT ON profiles FROM authenticated;
REVOKE UPDATE (role, is_hidden, total_points) ON profiles FROM authenticated;

-- Las escrituras de las funciones SECURITY DEFINER pasan (el trigger
-- ve a postgres): el motor LoL escribe total_points de profiles
-- solo en v1; aquí basta con una función propia como la de puntos.
CREATE FUNCTION pg_temp.definer_points(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.profiles SET total_points = total_points + 1 WHERE id = p;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.definer_points(uuid) TO authenticated;
SELECT is(pg_temp.u('sec-user', format('SELECT pg_temp.definer_points(%L)', t.uid('sec-user'))), 'ok',
          'una función SECURITY DEFINER sí escribe total_points');
UPDATE profiles SET total_points = 0 WHERE id = t.uid('sec-user');

-- Alta (signup): handle_new_user crea el perfil USER con los datos del registro.
-- El harness no copia el trigger de auth.users; se crea aquí.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (md5('woski-test:sec-signup')::uuid, 'signup@example.com', '{"nickname": "sec-signup", "birth_date": "2000-01-02"}');
SELECT is((SELECT nickname || '/' || role || '/' || is_hidden || '/' || total_points || '/' || birth_date FROM profiles WHERE id = t.uid('sec-signup')),
          'sec-signup/USER/false/0/2000-01-02', 'signup: handle_new_user crea el perfil USER');
SELECT is(pg_temp.u('sec-signup', pg_temp.n(format('UPDATE profiles SET avatar_url = %L WHERE id = %L', 'https://x/a.png', t.uid('sec-signup')))),
          '1', 'signup: el usuario nuevo edita su avatar');
DROP TRIGGER on_auth_user_created ON auth.users;

-- Login / lectura: el perfil se sigue leyendo (NavBar, /perfil, admin: role)
SELECT is(pg_temp.u('sec-user', format('SELECT role::text FROM profiles WHERE id = %L', t.uid('sec-admin'))), 'ADMIN',
          'authenticated sigue leyendo perfiles (comprobación de role)');

-- Funciones admin_* siguen funcionando para un ADMIN real
CREATE TEMP TABLE adm AS
SELECT pg_temp.u('sec-admin', format('SELECT admin_create_lol_match(%s, %L, %L, %L, 3)', (SELECT ph FROM ctx), 'AAA', 'BBB',
                 date_trunc('day', now() + interval '4 days') + interval '15 hours')) AS r;
SELECT ok((SELECT r FROM adm) LIKE '{"match_id": %', 'ADMIN: admin_create_lol_match');
SELECT unalike(pg_temp.u('sec-admin', format('SELECT rescore_lol_edition(%s)', (SELECT e FROM ctx))), '42501%',
          'ADMIN: rescore_lol_edition');
SELECT ok(pg_temp.u('sec-admin', 'SELECT admin_lol_ops_today()::text') LIKE '{%', 'ADMIN: admin_lol_ops_today');
SELECT is(pg_temp.u('sec-user', format('SELECT rescore_lol_edition(%s)', (SELECT e FROM ctx))), '42501: Solo un administrador puede hacer esto',
          'usuario normal sigue sin poder');


-- ============================================================
--  S2 — pools
-- ============================================================

-- join_code: ni authenticated ni anon
SELECT alike(pg_temp.u('sec-legacy', 'SELECT join_code FROM pools LIMIT 1'), '42501: permission denied%', 'authenticated no lee pools.join_code');
SELECT alike(pg_temp.u('sec-legacy', 'SELECT count(*) FROM pools WHERE join_code = ''SECLEG'''), '42501: permission denied%',
             'authenticated no filtra por pools.join_code (no se adivina)');
SELECT alike(pg_temp.u('sec-legacy', 'SELECT count(*) FROM (SELECT * FROM pools) p'), '42501: permission denied%', 'ni con SELECT *');
SELECT alike(t.run_as('anon', NULL, 'SELECT join_code FROM pools LIMIT 1'), '42501: permission denied%', 'anon no lee pools.join_code');
SELECT is(t.run_as('service_role', NULL, format('SELECT join_code FROM pools WHERE id = %s', (SELECT legacy FROM ctx))), 'SECLEG',
          'service_role sí (admin/leagues)');

-- Lo que sí lee la app
SELECT is(pg_temp.u('sec-legacy', format(
  'SELECT p.name || ''|'' || coalesce(p.description, '''') || ''|'' || p.created_by FROM pool_members pm JOIN pools p ON p.id = pm.pool_id WHERE pm.profile_id = %L AND p.club_id IS NULL',
  t.uid('sec-legacy'))), 'sec legacy||' || t.uid('sec-legacy'), '/ligas: el miembro sigue viendo su liga');
SELECT is(pg_temp.u('sec-legacy', format('SELECT count(*) FROM pools WHERE id = %s AND club_id IS NOT NULL AND edition_id = %s AND created_at IS NOT NULL',
                    (SELECT old_pool FROM ctx), (SELECT e FROM ctx))), '1', 'clubes/lol: id, club_id, edition_id, created_at legibles');

-- Ligas antiguas (sin club): congeladas
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT legacy FROM ctx), t.uid('sec-user'))),
             '42501: new row violates row-level security policy%', 'liga antigua: sin altas nuevas');
SELECT is((SELECT count(*) FROM pool_members WHERE pool_id = (SELECT legacy FROM ctx)), 1::bigint, 'liga antigua: el miembro actual sigue');
SELECT is(pg_temp.u('sec-user', format('SELECT total_points || '' '' || nickname FROM v_ranking_by_league WHERE league_id = %s', (SELECT legacy FROM ctx))),
          '7 sec-legacy', 'liga antigua: la clasificación se sigue leyendo');
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO pools (name, created_by) VALUES (%L, %L)', 'sec nueva liga', t.uid('sec-user'))),
             '42501: new row violates row-level security policy%', 'no se crean ligas sin club');
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO pools (name, created_by, join_code) VALUES (%L, %L, %L)', 'sec nueva liga', t.uid('sec-user'), 'ZZZZZZ')),
             '42501: permission denied%', 'nadie fija join_code en pools');

-- Pool antiguo con club y código propio (los 4 del backfill): por el club
SELECT alike(pg_temp.u('sec-user', format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT old_pool FROM ctx), t.uid('sec-user'))),
             '42501: new row violates row-level security policy%', 'pool antiguo con código: sin ser del club no se entra (antes sí)');
SELECT ok(pg_temp.u('sec-user', 'SELECT club_id FROM join_club(''secold'')') = (SELECT old_club FROM ctx)::text,
          'join_club con el código antiguo mete en el club');
SELECT is(pg_temp.u('sec-user', pg_temp.n(format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT old_pool FROM ctx), t.uid('sec-user')))),
          '1', 'y ya como miembro del club entra al pool');

-- No se meten otros ni se tocan puntos
SELECT alike(pg_temp.u('sec-legacy', format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT old_pool FROM ctx), t.uid('sec-other'))),
             '42501: new row violates row-level security policy%', 'no se inscribe a otro usuario');
SELECT alike(pg_temp.u('sec-legacy', pg_temp.n(format('UPDATE pool_members SET league_points = 999 WHERE profile_id = %L', t.uid('sec-legacy')))),
             '42501: permission denied%', 'nadie se pone league_points');
SELECT alike(pg_temp.u('sec-legacy', pg_temp.n(format('UPDATE pools SET name = %L WHERE id = %s', 'x', (SELECT legacy FROM ctx)))),
             '42501: permission denied%', 'pools no se actualiza desde el cliente');
SELECT alike(pg_temp.u('sec-legacy', pg_temp.n(format('DELETE FROM pools WHERE id = %s', (SELECT legacy FROM ctx)))),
             '42501: permission denied%', 'pools no se borra desde el cliente');


-- ============================================================
--  Flujos de club (app/(main)/clubes/actions.ts)
-- ============================================================

-- createClubAction: club + owner
CREATE TEMP TABLE club AS
SELECT pg_temp.u('sec-owner', format('INSERT INTO clubs (name, logo_url, join_code, created_by) VALUES (%L, NULL, %L, %L) RETURNING id',
                                     'sec club', 'SECCLB', t.uid('sec-owner')))::integer AS id;
GRANT SELECT ON club TO authenticated;
SELECT ok((SELECT id FROM club) IS NOT NULL, 'crear club');
SELECT is(pg_temp.u('sec-owner', pg_temp.n(format('INSERT INTO club_members (club_id, profile_id, role) VALUES (%s, %L, %L)',
                    (SELECT id FROM club), t.uid('sec-owner'), 'owner'))), '1', 'el creador entra como owner');

-- joinClubAction
SELECT is(pg_temp.u('sec-member', 'SELECT club_name || ''/'' || already_member FROM join_club(''secclb'')'), 'sec club/false', 'join_club por código');
SELECT is(pg_temp.u('sec-member', 'SELECT club_name || ''/'' || already_member FROM join_club(''SECCLB'')'), 'sec club/true', 'join_club repetido');
SELECT is(pg_temp.u('sec-member', 'SELECT count(*) FROM join_club(''NOEXIS'')'), '0', 'join_club con código inexistente');
SELECT alike(t.run_as('anon', NULL, 'SELECT count(*) FROM join_club(''SECCLB'')'), '42501: permission denied%', 'anon no usa join_club');

-- openPoolForEditionAction: comprobar que no existe, insertar, auto-unirse
SELECT is(pg_temp.u('sec-owner', format('SELECT count(*) FROM pools WHERE club_id = %s AND edition_id = %s', (SELECT id FROM club), (SELECT e FROM ctx))),
          '0', 'abrir pool: aún no existe');
CREATE TEMP TABLE pool AS
SELECT pg_temp.u('sec-owner', format('INSERT INTO pools (name, club_id, edition_id, created_by) VALUES (%L, %s, %s, %L) RETURNING id',
                                     'sec club · edición', (SELECT id FROM club), (SELECT e FROM ctx), t.uid('sec-owner')))::integer AS id;
GRANT SELECT ON pool TO authenticated;
SELECT ok((SELECT id FROM pool) IS NOT NULL, 'abrir pool de edición (owner)');
SELECT is(pg_temp.u('sec-owner', pg_temp.n(format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT id FROM pool), t.uid('sec-owner')))),
          '1', 'quien abre el pool entra');
SELECT alike(pg_temp.u('sec-member', format('INSERT INTO pools (name, club_id, edition_id, created_by) VALUES (%L, %s, %s, %L)',
                       'sec otro', (SELECT id FROM club), (SELECT e FROM ctx), t.uid('sec-member'))),
             '42501: new row violates row-level security policy%', 'un member no abre pools');
SELECT alike(pg_temp.u('sec-owner', format('INSERT INTO pools (name, club_id, created_by) VALUES (%L, %s, %L)',
                       'sec sin edición', (SELECT id FROM club), t.uid('sec-owner'))),
             '42501: new row violates row-level security policy%', 'pool de club sin edición: no');

-- joinPoolAction / leavePoolAction
SELECT is(pg_temp.u('sec-member', format('SELECT id || ''/'' || club_id FROM pools WHERE id = %s', (SELECT id FROM pool))),
          (SELECT id FROM pool) || '/' || (SELECT id FROM club), 'getClubPool: id y club_id');
SELECT is(pg_temp.u('sec-member', pg_temp.n(format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT id FROM pool), t.uid('sec-member')))),
          '1', 'un miembro del club se une al pool');
SELECT alike(pg_temp.u('sec-outsider', format('INSERT INTO pool_members (pool_id, profile_id) VALUES (%s, %L)', (SELECT id FROM pool), t.uid('sec-outsider'))),
             '42501: new row violates row-level security policy%', 'quien no es del club no se une');
SELECT is(pg_temp.u('sec-member', format('SELECT count(*) FROM pools WHERE edition_id = %s AND id IN (%s)', (SELECT e FROM ctx), (SELECT id FROM pool))),
          '1', '/lol: el pool se lista por edición');
SELECT is(pg_temp.u('sec-member', pg_temp.n(format('DELETE FROM pool_members WHERE pool_id = %s AND profile_id = %L', (SELECT id FROM pool), t.uid('sec-member')))),
          '1', 'salir del pool');
SELECT is(pg_temp.u('sec-member', format('SELECT role FROM club_members WHERE club_id = %s AND profile_id = %L', (SELECT id FROM club), t.uid('sec-member'))),
          'member', 'al salir del pool sigue en el club');


-- ============================================================
--  Revisión: vistas, ranking_snapshots, funciones abiertas
-- ============================================================

SELECT alike(t.run_as(r, CASE WHEN r = 'anon' THEN NULL ELSE t.uid('sec-user') END,
                      pg_temp.n(format('UPDATE v_ranking_global SET total_points = 999 WHERE profile_id = %L', t.uid('sec-other')))),
             '42501: permission denied%', r || ' no escribe en v_ranking_global')
FROM unnest(ARRAY['anon', 'authenticated']) r;
SELECT alike(t.run_as('anon', NULL, pg_temp.n(format('DELETE FROM v_ranking_global WHERE profile_id = %L', t.uid('sec-other')))),
             '42501: permission denied%', 'anon no borra perfiles a través de v_ranking_global');
SELECT isnt(t.run_as('anon', NULL, 'SELECT count(*) FROM v_ranking_global'), '0', 'v_ranking_global se sigue leyendo');

SELECT alike(t.run_as('anon', NULL, format('INSERT INTO ranking_snapshots (match_id, profile_id, rank, total_points) VALUES (1, %L, 1, 999)', t.uid('sec-user'))),
             '42501: permission denied%', 'anon no escribe ranking_snapshots');
SELECT alike(pg_temp.u('sec-user', 'DELETE FROM ranking_snapshots'), '42501: permission denied%', 'authenticated no borra ranking_snapshots');

SELECT alike(t.run_as('anon', NULL, 'SELECT calculate_match_points(1::smallint, 1, 0)'), '42501: permission denied%', 'anon no ejecuta calculate_match_points');
SELECT alike(pg_temp.u('sec-admin', 'SELECT calculate_match_points(1::smallint, 1, 0)'), '42501: permission denied%',
             'calculate_match_points: solo service role hasta que se repare');
SELECT alike(t.run_as('anon', NULL, 'SELECT record_ranking_snapshot(1::smallint)'), '42501: permission denied%', 'anon no ejecuta record_ranking_snapshot');
SELECT is(pg_temp.u('sec-user', 'SELECT record_ranking_snapshot(1::smallint)'), '42501: Solo un administrador puede hacer esto',
          'usuario normal no congela snapshots');
SELECT is(pg_temp.u('sec-admin', format('SELECT record_ranking_snapshot(%s::smallint)', (SELECT r::jsonb ->> 'match_id' FROM adm))), 'ok',
          'ADMIN sí congela snapshots (saveMatchResultAction)');
SELECT alike(t.run_as('anon', NULL, 'SELECT count(*) FROM get_admin_player_ranking()'), '42501: permission denied%', 'anon no lee get_admin_player_ranking');
SELECT alike(pg_temp.u('sec-user', 'SELECT count(*) FROM get_admin_player_ranking()'), '42501: permission denied%', 'authenticated tampoco');
SELECT isnt(t.run_as('service_role', NULL, 'SELECT count(*) FROM get_admin_player_ranking()'), '0', 'service_role sí (/admin/jugadores)');

SELECT * FROM finish();
ROLLBACK;
