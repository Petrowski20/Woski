-- Equipos y logos (20261019100001_team_logos): bucket team-logos,
-- políticas de Storage (solo ADMIN escribe o borra), CHECK de la URL,
-- admin_update_lol_team y admin_set_lol_team_logo con auditoría.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(45);

DO $$
BEGIN
  PERFORM t.player('tl-admin', p_role => 'ADMIN');
  PERFORM t.player('tl-user');
  PERFORM t.team('TLA');
  PERFORM t.team('TLB');
  PERFORM t.team('TLC');
  INSERT INTO teams (sport_id, slug, name, iso_code)
  SELECT id, 'tl-futbol', 'Selección', 'TLF' FROM sports WHERE slug = 'football';
END;
$$;

CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;
-- Lo que hace storage-api al subir: INSERT en storage.objects con la sesión del usuario.
CREATE FUNCTION pg_temp.put(p_role text, p_nick text, p_bucket text, p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as(p_role, CASE WHEN p_nick IS NULL THEN NULL ELSE t.uid(p_nick) END,
                  format('INSERT INTO storage.objects (bucket_id, name, metadata) VALUES (%L, %L, ''{}''::jsonb) RETURNING name',
                         p_bucket, p_name));
$$;
CREATE FUNCTION pg_temp.url(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'http://localhost:54399/storage/v1/object/public/team-logos/' || p_name;
$$;
CREATE FUNCTION pg_temp.tid(p_tag text) RETURNS integer LANGUAGE sql AS $$
  SELECT id FROM teams WHERE slug IN ('lol-test-' || lower(p_tag), 'tl-' || p_tag);
$$;

-- ---------------- Bucket ----------------
SELECT results_eq(
  $$ SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'team-logos' $$,
  $$ VALUES (true, 524288::bigint, ARRAY['image/png', 'image/webp']) $$,
  'bucket team-logos público, 512 KB, solo PNG y WebP');

-- ---------------- Storage: subir ----------------
SELECT is(pg_temp.put('authenticated', 'tl-admin', 'team-logos', 'aaaaaaaaaaaaaaaa.png'), 'aaaaaaaaaaaaaaaa.png',
          'un ADMIN sube un logo');
SELECT is(pg_temp.put('authenticated', 'tl-admin', 'team-logos', 'bbbbbbbbbbbbbbbb.webp'), 'bbbbbbbbbbbbbbbb.webp',
          'un ADMIN sube un WebP');
SELECT alike(pg_temp.put('authenticated', 'tl-user', 'team-logos', 'cccccccccccccccc.png'), '42501:%',
             'un USER no puede subir');
SELECT alike(pg_temp.put('anon', NULL, 'team-logos', 'cccccccccccccccc.png'), '42501:%',
             'anon no puede subir');
SELECT alike(pg_temp.put('authenticated', 'tl-admin', 'team-logos', 'logo.png'), '42501:%',
             'ni un ADMIN elige un nombre que no sea hash.ext');
SELECT alike(pg_temp.put('authenticated', 'tl-admin', 'team-logos', 'cccccccccccccccc.svg'), '42501:%',
             'ni un ADMIN sube un .svg');
SELECT alike(pg_temp.put('authenticated', 'tl-admin', 'team-logos', 'otra/cccccccccccccccc.png'), '42501:%',
             'ni un ADMIN sube a una carpeta');
SELECT alike(pg_temp.put('authenticated', 'tl-admin', 'otro-bucket', 'cccccccccccccccc.png'), '42501:%',
             'las políticas son solo para team-logos');

-- ---------------- Storage: cambiar y borrar ----------------
SELECT is(pg_temp.u('tl-user', $$ SELECT count(*) FROM storage.objects WHERE bucket_id = 'team-logos' $$), '0',
          'un USER no lista los archivos por la API');
SELECT is(pg_temp.u('tl-user', $$ WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'team-logos' RETURNING 1) SELECT count(*) FROM d $$),
          '0', 'un USER no borra nada');
SELECT is(t.run_as('anon', NULL, $$ WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'team-logos' RETURNING 1) SELECT count(*) FROM d $$),
          '0', 'anon no borra nada');
SELECT is(pg_temp.u('tl-admin', $$ WITH d AS (UPDATE storage.objects SET name = 'dddddddddddddddd.png' WHERE bucket_id = 'team-logos' RETURNING 1) SELECT count(*) FROM d $$),
          '0', 'ni un ADMIN sobrescribe ni renombra (sin política de UPDATE)');
SELECT is(pg_temp.u('tl-user', $$ WITH d AS (UPDATE storage.objects SET name = 'dddddddddddddddd.png' WHERE bucket_id = 'team-logos' RETURNING 1) SELECT count(*) FROM d $$),
          '0', 'un USER tampoco');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'team-logos'), 2::bigint,
          'siguen los dos archivos subidos');

-- ---------------- CHECK de teams ----------------
SELECT throws_ok($$ UPDATE teams SET logo_url = 'https://evil.example/logo.png' WHERE id = pg_temp.tid('TLA') $$,
                 '23514', NULL, 'CHECK: una URL de otro sitio no entra');
SELECT throws_ok($$ UPDATE teams SET logo_url = 'http://localhost:54399/storage/v1/object/public/club-logos/aaaaaaaaaaaaaaaa.png' WHERE id = pg_temp.tid('TLA') $$,
                 '23514', NULL, 'CHECK: otro bucket no entra');
SELECT throws_ok($$ UPDATE teams SET logo_url = pg_temp.url('aaaaaaaaaaaaaaaa.svg') WHERE id = pg_temp.tid('TLA') $$,
                 '23514', NULL, 'CHECK: .svg no entra');
SELECT throws_ok($$ UPDATE teams SET color = 'red' WHERE id = pg_temp.tid('TLA') $$,
                 '23514', NULL, 'CHECK: color solo #rrggbb');

-- ---------------- admin_set_lol_team_logo ----------------
SELECT is(pg_temp.u('tl-admin', format('SELECT previous_object IS NULL FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLA'), pg_temp.url('aaaaaaaaaaaaaaaa.png'))),
          'true', 'un ADMIN pone el logo (no había anterior)');
SELECT is((SELECT logo_url FROM teams WHERE id = pg_temp.tid('TLA')), pg_temp.url('aaaaaaaaaaaaaaaa.png'),
          'la URL queda guardada');
SELECT results_eq(
  $$ SELECT actor_id, actor_kind, action, before ->> 'logo_url', after ->> 'logo_url'
     FROM lol_admin_audit WHERE team_id = pg_temp.tid('TLA') ORDER BY id DESC LIMIT 1 $$,
  $$ VALUES (t.uid('tl-admin'), 'admin', 'set_team_logo', NULL::text, pg_temp.url('aaaaaaaaaaaaaaaa.png')) $$,
  'queda registrado quién lo cambió, antes y después');
SELECT is(pg_temp.u('tl-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLB'), pg_temp.url('aaaaaaaaaaaaaaaa.png'))),
          '1', 'otro equipo puede usar el mismo archivo');
SELECT is(pg_temp.u('tl-admin', format('SELECT previous_object || '' '' || previous_in_use FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLA'), pg_temp.url('bbbbbbbbbbbbbbbb.webp'))),
          'aaaaaaaaaaaaaaaa.png true', 'al cambiarlo, devuelve el anterior y que otro equipo lo sigue usando');
SELECT is(pg_temp.u('tl-admin', format('SELECT previous_object || '' '' || previous_in_use FROM admin_set_lol_team_logo(%s, NULL)',
                                       pg_temp.tid('TLB'))),
          'aaaaaaaaaaaaaaaa.png false', 'al quitar el último uso, el anterior se puede borrar');
SELECT is((SELECT logo_url FROM teams WHERE id = pg_temp.tid('TLB')), NULL, 'el logo queda quitado');
SELECT is((SELECT action FROM lol_admin_audit WHERE team_id = pg_temp.tid('TLB') ORDER BY id DESC LIMIT 1), 'remove_team_logo',
          'quitarlo también queda registrado');
SELECT is(pg_temp.u('tl-admin', format('SELECT previous_object IS NULL FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLA'), pg_temp.url('bbbbbbbbbbbbbbbb.webp'))),
          'true', 'poner el mismo logo no cambia nada ni devuelve anterior');
SELECT is(pg_temp.u('tl-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLC'), pg_temp.url('eeeeeeeeeeeeeeee.png'))),
          '22023: El archivo eeeeeeeeeeeeeeee.png no está en team-logos', 'el archivo tiene que existir en el bucket');
SELECT is(pg_temp.u('tl-admin', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L)',
                                       pg_temp.tid('TLC'), 'https://evil.example/storage/v1/object/public/otro/aaaaaaaaaaaaaaaa.png')),
          '22023: La URL del logo no es del bucket team-logos', 'una URL de fuera se rechaza');
SELECT is(pg_temp.u('tl-user', format('SELECT count(*) FROM admin_set_lol_team_logo(%s, %L)',
                                      pg_temp.tid('TLC'), pg_temp.url('aaaaaaaaaaaaaaaa.png'))),
          '42501: Solo un administrador puede hacer esto', 'un USER no cambia logos');
SELECT alike(t.run_as('anon', NULL, format('SELECT count(*) FROM admin_set_lol_team_logo(%s, NULL)', pg_temp.tid('TLA'))),
             '42501: permission denied for function admin_set_lol_team_logo%', 'anon no cambia logos');
SELECT alike(t.run_as('service_role', NULL, format('SELECT count(*) FROM admin_set_lol_team_logo(%s, NULL)', pg_temp.tid('TLA'))),
             '42501:%', 'service_role tampoco (sin autor identificado)');

-- ---------------- admin_update_lol_team ----------------
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, %L)', pg_temp.tid('TLC'), '  Team Cee ', 'tlc2', '#A1B2C3')),
          'ok', 'un ADMIN cambia nombre, siglas y color');
SELECT results_eq(
  $$ SELECT name, iso_code, color FROM teams WHERE id = pg_temp.tid('TLC') $$,
  $$ VALUES ('Team Cee', 'TLC2', '#a1b2c3') $$, 'se guardan limpios (siglas en mayúsculas, color en minúsculas)');
SELECT results_eq(
  $$ SELECT action, before ->> 'tag', after ->> 'tag', after ->> 'color' FROM lol_admin_audit WHERE team_id = pg_temp.tid('TLC') ORDER BY id DESC LIMIT 1 $$,
  $$ VALUES ('update_team', 'TLC', 'TLC2', '#a1b2c3') $$, 'el cambio queda registrado');
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('TLC'), 'Team Cee', 'TLA')),
          '23505: Ya hay otro equipo de LoL con las siglas TLA', 'siglas repetidas');
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('TLC'), 'Team Cee', 'T L')),
          '22023: Las siglas deben tener de 2 a 6 letras o números, sin espacios', 'siglas no válidas');
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, %L)', pg_temp.tid('TLC'), 'Team Cee', 'TLC2', 'red')),
          '22023: El color debe tener el formato #rrggbb', 'color no válido');
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('TLC'), 'X', 'TLC2')),
          '22023: El nombre debe tener entre 2 y 60 caracteres', 'nombre demasiado corto');
SELECT is(pg_temp.u('tl-admin', format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('futbol'), 'Otro', 'OTR')),
          '22023: El equipo ' || pg_temp.tid('futbol') || ' no existe o no es de LoL', 'solo equipos de LoL');
SELECT is(pg_temp.u('tl-user', format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('TLC'), 'Hack', 'HCK')),
          '42501: Solo un administrador puede hacer esto', 'un USER no edita equipos');
SELECT alike(t.run_as('anon', NULL, format('SELECT admin_update_lol_team(%s, %L, %L, NULL)', pg_temp.tid('TLC'), 'Hack', 'HCK')),
             '42501: permission denied for function admin_update_lol_team%', 'anon no edita equipos');
SELECT is(pg_temp.u('tl-user', format('UPDATE teams SET logo_url = NULL, name = %L WHERE id = %s RETURNING name', 'Hack', pg_temp.tid('TLA'))),
          'ok', 'un USER tampoco escribe en teams directamente (RLS: 0 filas)');
SELECT is((SELECT name FROM teams WHERE id = pg_temp.tid('TLA')), 'Team TLA', 'el equipo no ha cambiado');

SELECT * FROM finish();
ROLLBACK;
