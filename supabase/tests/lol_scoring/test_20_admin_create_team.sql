-- Alta de equipos de LoL desde /admin (20261022100001):
-- admin_create_lol_team y admin_create_lol_teams (lote, todo o nada).
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(54);

DO $$
BEGIN
  PERFORM t.player('ct-admin', p_role => 'ADMIN');
  PERFORM t.player('ct-user');
  PERFORM t.team('CTA');                       -- slug lol-test-cta, siglas CTA
  -- Slug ocupado por un equipo que cambió de siglas (como lol-bds → SHFT).
  INSERT INTO teams (sport_id, slug, name, iso_code)
  SELECT id, 'lol-old', 'Renombrado', 'NEWT' FROM sports WHERE slug = 'lol';
  -- Mismas siglas en otro deporte.
  INSERT INTO teams (sport_id, slug, name, iso_code)
  SELECT id, 'ct-futbol', 'Selección', 'CTF' FROM sports WHERE slug = 'football';
END;
$$;

CREATE FUNCTION pg_temp.u(p_nick text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick), p_sql);
$$;
CREATE FUNCTION pg_temp.mk(p_nick text, p_args text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.u(p_nick, 'SELECT admin_create_lol_team(' || p_args || ')');
$$;
CREATE TEMP TABLE n0 AS
SELECT (SELECT count(*) FROM teams) AS teams, (SELECT count(*) FROM lol_admin_audit) AS audit;

-- ---------------- Permisos ----------------
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'admin_create_lol_team(text,text,text,text,text,text)'::regprocedure),
          'admin_create_lol_team es SECURITY DEFINER');
SELECT ok((SELECT 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = 'admin_create_lol_team(text,text,text,text,text,text)'::regprocedure),
          'admin_create_lol_team con search_path fijo');
SELECT ok((SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = 'admin_create_lol_teams(jsonb,text)'::regprocedure),
          'admin_create_lol_teams: SECURITY DEFINER y search_path fijo');
SELECT ok(NOT has_function_privilege('anon', 'admin_create_lol_team(text,text,text,text,text,text)', 'EXECUTE'), 'anon sin EXECUTE');
SELECT ok(NOT has_function_privilege('anon', 'admin_create_lol_teams(jsonb,text)', 'EXECUTE'), 'anon sin EXECUTE (lote)');
SELECT ok(NOT has_function_privilege('service_role', 'admin_create_lol_team(text,text,text,text,text,text)', 'EXECUTE'), 'service_role sin EXECUTE');
SELECT ok(has_function_privilege('authenticated', 'admin_create_lol_team(text,text,text,text,text,text)', 'EXECUTE'), 'authenticated con EXECUTE');

SELECT alike(t.run_as('anon', NULL, $$ SELECT admin_create_lol_team('Anon', 'AN', 'EMEA') $$), '42501:%', 'anon: rechazado');
SELECT alike(t.run_as('service_role', NULL, $$ SELECT admin_create_lol_team('Servicio', 'SV', 'EMEA') $$), '42501:%', 'service_role: rechazado');
SELECT alike(pg_temp.mk('ct-user', $$'Usuario', 'US1', 'EMEA'$$), '42501:%', 'un USER: rechazado');
SELECT alike(pg_temp.u('ct-user', $$ SELECT admin_create_lol_teams('[{"name":"Lote","tag":"LT","region":"EMEA"}]') $$), '42501:%',
             'un USER: lote rechazado');
SELECT alike(t.run_as('authenticated', NULL, $$ SELECT admin_create_lol_team('Sin uid', 'SU', 'EMEA') $$), '42501:%',
             'authenticated sin uid: rechazado');
SELECT is((SELECT count(*) FROM teams), (SELECT teams FROM n0), 'los rechazos no crean nada');

-- ---------------- Alta correcta ----------------
CREATE TEMP TABLE r1 AS SELECT pg_temp.mk('ct-admin', $$'  Movistar Nuevo  ', ' mk2 ', 'emea', 'es', '#AABBCC', 'alta de prueba'$$) AS res;
SELECT ok((SELECT res ~ '^[0-9]+$' FROM r1), 'un ADMIN crea el equipo y recibe el id');
CREATE TEMP TABLE c1 AS SELECT * FROM teams WHERE id = (SELECT res::integer FROM r1);
SELECT is((SELECT name FROM c1), 'Movistar Nuevo', 'nombre sin espacios sobrantes');
SELECT is((SELECT iso_code FROM c1), 'MK2', 'siglas en mayúsculas');
SELECT is((SELECT slug FROM c1), 'lol-mk2', 'slug = lol- + siglas en minúscula');
SELECT is((SELECT sport_id FROM c1), (SELECT id FROM sports WHERE slug = 'lol'), 'deporte LoL');
SELECT is((SELECT color FROM c1), '#aabbcc', 'color en minúsculas');
SELECT is((SELECT metadata FROM c1), '{"region": "EMEA", "country": "ES"}'::jsonb, 'región y país en metadata');
SELECT ok((SELECT logo_url IS NULL FROM c1), 'sin logo');
SELECT ok(is_lol_team((SELECT id FROM c1)), 'is_lol_team: sirve para crear series');

-- Auditoría
CREATE TEMP TABLE a1 AS SELECT * FROM lol_admin_audit WHERE team_id = (SELECT id FROM c1);
SELECT is((SELECT count(*) FROM a1), 1::bigint, 'una fila de auditoría');
SELECT is((SELECT action || '|' || actor_kind || '|' || actor_id::text FROM a1), 'create_team|admin|' || t.uid('ct-admin')::text,
          'acción create_team, actor admin con su id');
SELECT ok((SELECT before IS NULL FROM a1), 'before NULL (no existía)');
SELECT is((SELECT after FROM a1),
          '{"name": "Movistar Nuevo", "tag": "MK2", "color": "#aabbcc", "logo_url": null, "slug": "lol-mk2", "region": "EMEA", "country": "ES"}'::jsonb,
          'after con nombre, siglas, color, slug, región y país');
SELECT is((SELECT reason FROM a1), 'alta de prueba', 'motivo guardado');

-- Opcionales vacíos y alta desde el SQL Editor (sesión postgres sin JWT)
SELECT lives_ok($$ SELECT admin_create_lol_team('Sin color', 'SC', 'KR', '', '') $$, 'SQL Editor: país y color vacíos valen');
SELECT is((SELECT color IS NULL AND metadata = '{"region": "KR"}'::jsonb FROM teams WHERE slug = 'lol-sc'), true,
          'sin país ni color: metadata solo con la región');
SELECT is((SELECT actor_kind FROM lol_admin_audit WHERE team_id = (SELECT id FROM teams WHERE slug = 'lol-sc')), 'sql',
          'desde el SQL Editor la auditoría dice sql');

-- ---------------- Validaciones ----------------
SELECT is(pg_temp.mk('ct-admin', $$'   ', 'EM', 'EMEA'$$), '22023: El nombre no puede estar vacío', 'nombre vacío');
SELECT is(pg_temp.mk('ct-admin', $$NULL, 'EM', 'EMEA'$$), '22023: El nombre no puede estar vacío', 'nombre NULL');
SELECT is(pg_temp.mk('ct-admin', $$'X', 'EM', 'EMEA'$$), '22023: El nombre debe tener entre 2 y 60 caracteres', 'nombre de 1 letra');
SELECT is(pg_temp.mk('ct-admin', $$'Siglas', 'A', 'EMEA'$$),
          '22023: Las siglas deben tener de 2 a 5 letras o números, sin espacios ni símbolos', 'siglas de 1 carácter');
SELECT alike(pg_temp.mk('ct-admin', $$'Siglas', 'ABCDEF', 'EMEA'$$), '22023: Las siglas%', 'siglas de 6 caracteres');
SELECT alike(pg_temp.mk('ct-admin', $$'Siglas', 'G-2', 'EMEA'$$), '22023: Las siglas%', 'siglas con guion');
SELECT alike(pg_temp.mk('ct-admin', $$'Siglas', 'G 2', 'EMEA'$$), '22023: Las siglas%', 'siglas con espacio');
SELECT alike(pg_temp.mk('ct-admin', $$'Siglas', 'ÑU', 'EMEA'$$), '22023: Las siglas%', 'siglas con Ñ');
SELECT is(pg_temp.mk('ct-admin', $$'Región', 'RG', 'EU'$$), '22023: La región debe ser EMEA, NA, BR, KR, CN o APAC', 'región desconocida');
SELECT is(pg_temp.mk('ct-admin', $$'País', 'PS', 'NA', 'ESP'$$),
          '22023: El país debe ser un código de 2 letras (ES, KR, US…) o quedar vacío', 'país de 3 letras');
SELECT is(pg_temp.mk('ct-admin', $$'Color', 'CL', 'NA', NULL, '#fff'$$), '22023: El color debe tener el formato #rrggbb', 'color corto');
SELECT is(pg_temp.mk('ct-admin', $$'Color', 'CL', 'NA', NULL, 'red'$$), '22023: El color debe tener el formato #rrggbb', 'color con nombre');
SELECT is(pg_temp.mk('ct-admin', $$'Duplicado', 'cta', 'EMEA'$$), '23505: Ya hay un equipo de LoL con las siglas CTA (Team CTA)',
          'siglas repetidas en LoL (sin distinguir mayúsculas)');
SELECT is(pg_temp.mk('ct-admin', $$'Viejo', 'OLD', 'EMEA'$$),
          '23505: El identificador lol-old ya lo usa el equipo Renombrado (NEWT); elige otras siglas', 'slug ocupado');
SELECT ok(pg_temp.mk('ct-admin', $$'Selección LoL', 'CTF', 'BR'$$) ~ '^[0-9]+$', 'las mismas siglas en fútbol no impiden el alta en LoL');

-- ---------------- Lote ----------------
CREATE TEMP TABLE n1 AS
SELECT (SELECT count(*) FROM teams) AS teams, (SELECT count(*) FROM lol_admin_audit) AS audit;
SELECT is(pg_temp.u('ct-admin', $$ SELECT admin_create_lol_teams('[{"name":"Lote Uno","tag":"LU1","region":"CN"},
                                                                  {"name":"Lote Dos","tag":"LU2","region":"CN"},
                                                                  {"name":"Lote Tres","tag":"CTA","region":"CN"}]') $$),
          '23505: Fila 3 (CTA): Ya hay un equipo de LoL con las siglas CTA (Team CTA)', 'lote: el error dice la fila');
SELECT is((SELECT count(*) FROM teams), (SELECT teams FROM n1), 'atomicidad: la fila 3 falla y no se crea ninguna');
SELECT is((SELECT count(*) FROM lol_admin_audit), (SELECT audit FROM n1), 'atomicidad: tampoco queda auditoría');
SELECT alike(pg_temp.u('ct-admin', $$ SELECT admin_create_lol_teams('[{"name":"Uno","tag":"DUP","region":"NA"},{"name":"Otro","tag":"dup","region":"NA"}]') $$),
             '23505: Fila 2 (DUP):%', 'lote: siglas repetidas dentro del lote');
SELECT is(pg_temp.u('ct-admin', $$ SELECT admin_create_lol_teams('[]') $$), '22023: La lista de equipos está vacía', 'lote vacío');
SELECT is(pg_temp.u('ct-admin', $$ SELECT admin_create_lol_teams('[{"name":"Uno","tag":"OK1","region":"NA"},"x"]') $$),
          '22023: Fila 2 (?): cada fila debe ser un objeto con name, tag y region', 'lote: fila que no es objeto');
SELECT is(pg_temp.u('ct-admin', $$ SELECT array_length(admin_create_lol_teams('[{"name":"Lote Uno","tag":"LU1","region":"CN"},{"name":"Lote Dos","tag":"LU2","region":"CN","country":"cn","color":"#112233"}]'), 1) $$),
          '2', 'lote correcto: dos ids');
SELECT is((SELECT string_agg(slug || '/' || (metadata ->> 'region') || '/' || coalesce(metadata ->> 'country', '-'), ',' ORDER BY id)
           FROM teams WHERE slug IN ('lol-lu1', 'lol-lu2')), 'lol-lu1/CN/-,lol-lu2/CN/CN', 'lote: slugs y metadata');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'create_team'
           AND team_id IN (SELECT id FROM teams WHERE slug IN ('lol-lu1', 'lol-lu2'))), 2::bigint, 'lote: una auditoría por equipo');

SELECT * FROM finish();
ROLLBACK;
