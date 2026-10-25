-- Plantillas de LoL por edición (20261026100001): lol_players,
-- lol_roster y las funciones de admin de carga, picks y baja.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(34);

DO $$
DECLARE
  e  integer := t.edition('plantillas');
  e2 integer := t.edition('plantillas 2');
BEGIN
  PERFORM t.player('rs-admin', p_role => 'ADMIN');
  PERFORM t.player('rs-user');
  PERFORM t.team('NAVI'); PERFORM t.team('G2'); PERFORM t.team('MKOI');
  CREATE TEMP TABLE rs AS SELECT e, e2,
    (SELECT ed.id FROM editions ed JOIN competitions c ON c.id = ed.competition_id WHERE c.slug = 'fifa-world-cup' LIMIT 1) AS fe;
END;
$$;
GRANT SELECT ON rs TO authenticated, anon;

CREATE FUNCTION pg_temp.imp(p_nick text, p_rows text, p_replace boolean DEFAULT true, p_e integer DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT t.run_as('authenticated', t.uid(p_nick),
    format('SELECT admin_import_lol_roster(%s, %L::jsonb, %s)', COALESCE(p_e, (SELECT e FROM rs)), p_rows, CASE WHEN p_replace THEN 'true' ELSE 'false' END));
$$;
CREATE FUNCTION pg_temp.roster(p_tag text, p_e integer DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(r.role || ':' || p.nickname || ':' || coalesce(p.country, '-'), ',' ORDER BY r.id)
  FROM lol_roster r JOIN lol_players p ON p.id = r.player_id JOIN teams tm ON tm.id = r.team_id
  WHERE r.edition_id = COALESCE(p_e, (SELECT e FROM rs)) AND tm.iso_code = p_tag;
$$;
CREATE FUNCTION pg_temp.rid(p_nick text) RETURNS integer LANGUAGE sql AS $$
  SELECT r.id FROM lol_roster r JOIN lol_players p ON p.id = r.player_id
  WHERE r.edition_id = (SELECT e FROM rs) AND p.nickname = p_nick;
$$;

-- ---------------- Permisos ----------------
SELECT ok(NOT has_function_privilege('anon', 'admin_import_lol_roster(integer,jsonb,boolean,text)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'admin_import_lol_roster(integer,jsonb,boolean,text)', 'EXECUTE'),
          'importar: ni anon ni service_role');
SELECT ok((SELECT bool_and(prosecdef AND 'search_path=public' = ANY (proconfig)) FROM pg_proc
           WHERE proname IN ('admin_import_lol_roster', 'admin_set_lol_roster_picks', 'admin_remove_lol_roster_entry')),
          'las tres: SECURITY DEFINER y search_path fijo');
SELECT alike(pg_temp.imp('rs-user', '[{"team":"NAVI","role":"TOP","nickname":"Maynter"}]'), '42501:%', 'un USER no carga plantillas');
SELECT alike(t.run_as('anon', NULL, format('SELECT admin_import_lol_roster(%s, ''[]''::jsonb, true)', (SELECT e FROM rs))), '42501:%',
             'anon no carga plantillas');
SELECT alike(t.run_as('authenticated', t.uid('rs-admin'), 'INSERT INTO lol_players (nickname) VALUES (''Hack'')'), '42501:%',
             'ni un ADMIN escribe directamente en lol_players');
SELECT alike(t.run_as('authenticated', t.uid('rs-admin'), format(
               'INSERT INTO lol_roster (edition_id, team_id, player_id, role) SELECT %s, 1, 1, ''TOP''', (SELECT e FROM rs))),
             '42501:%', 'ni en lol_roster');

-- ---------------- Carga ----------------
SELECT is(pg_temp.imp('rs-admin', '[
  {"team":"navi","role":"top","nickname":"Maynter","country":"ua"},
  {"team":"NAVI","role":"JUNGLE","nickname":"Rhilech","country":"TR"},
  {"team":"NAVI","role":"MID","nickname":"Poby","country":"KR","real_name":"Son Seong-hyeon"},
  {"team":"NAVI","role":"COACH","nickname":"TheRock","country":"GR"},
  {"team":"NAVI","role":"COACH","nickname":"GotoOne","country":"FR"},
  {"team":"G2","role":"MID","nickname":"Caps","country":"DK"}]'), '6', 'un ADMIN carga 6 filas de 2 equipos');
SELECT is(pg_temp.roster('NAVI'), 'TOP:Maynter:UA,JUNGLE:Rhilech:TR,MID:Poby:KR,COACH:TheRock:GR,COACH:GotoOne:FR',
          'siglas, rol y país en mayúsculas; dos coaches');
SELECT is((SELECT real_name FROM lol_players WHERE nickname = 'Poby'), 'Son Seong-hyeon', 'nombre real guardado');
SELECT is((SELECT count(*) FROM lol_admin_audit WHERE action = 'import_roster' AND edition_id = (SELECT e FROM rs)), 2::bigint,
          'auditoría: una fila por equipo');
SELECT is((SELECT jsonb_array_length(after -> 'roster') FROM lol_admin_audit WHERE action = 'import_roster'
           AND team_id = (SELECT id FROM teams WHERE iso_code = 'NAVI') ORDER BY id DESC LIMIT 1), 5, 'auditoría con la plantilla de después');

-- Sustituir: la plantilla de NAVI se rehace entera; G2 no se toca.
SELECT is(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"TOP","nickname":"maynter"},{"team":"NAVI","role":"SUPPORT","nickname":"Parus","country":"TR"}]'),
          '2', 'recargar NAVI');
SELECT is(pg_temp.roster('NAVI'), 'TOP:Maynter:UA,SUPPORT:Parus:TR', 'p_replace: NAVI queda solo con lo nuevo (nick sin distinguir mayúsculas, país conservado)');
SELECT is(pg_temp.roster('G2'), 'MID:Caps:DK', 'G2 intacto');
SELECT is((SELECT count(*) FROM lol_players WHERE lower(nickname) = 'maynter'), 1::bigint, 'el jugador no se duplica');
-- Sin sustituir: se añade.
SELECT is(pg_temp.imp('rs-admin', '[{"team":"G2","role":"TOP","nickname":"BrokenBlade","country":"DE"}]', false), '1', 'añadir sin sustituir');
SELECT is(pg_temp.roster('G2'), 'MID:Caps:DK,TOP:BrokenBlade:DE', 'G2 conserva a Caps');
-- Un jugador, un equipo por edición: fichaje dentro de la edición.
SELECT is(pg_temp.imp('rs-admin', '[{"team":"MKOI","role":"MID","nickname":"Caps"}]', false), '1', 'Caps pasa a MKOI');
SELECT is(pg_temp.roster('G2') || ' / ' || pg_temp.roster('MKOI'), 'TOP:BrokenBlade:DE / MID:Caps:DK', 'ya no está en G2');
-- Otra edición: plantillas independientes.
SELECT is(pg_temp.imp('rs-admin', '[{"team":"G2","role":"MID","nickname":"Caps"}]', true, (SELECT e2 FROM rs)), '1', 'otra edición');
SELECT is(pg_temp.roster('MKOI'), 'MID:Caps:DK', 'la primera edición no cambia');

-- ---------------- Validaciones (todo o nada) ----------------
CREATE TEMP TABLE n0 AS SELECT (SELECT count(*) FROM lol_roster) AS r, (SELECT count(*) FROM lol_players) AS p;
SELECT is(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"TOP","nickname":"Nuevo"},{"team":"XXX","role":"MID","nickname":"Otro"}]'),
          '22023: Fila 2 (Otro): no hay ningún equipo de LoL con las siglas "XXX"', 'siglas desconocidas');
SELECT is(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"BOT","nickname":"Nuevo"}]'),
          '22023: Fila 1 (Nuevo): rol "BOT" no válido (TOP, JUNGLE, MID, ADC, SUPPORT o COACH)', 'rol no válido');
SELECT is(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"TOP","nickname":"Nuevo","country":"ESP"}]'),
          '22023: Fila 1 (Nuevo): país "ESP" no válido (código de 2 letras: ES, KR…)', 'país no válido');
SELECT is(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"TOP","nickname":"A"},{"team":"G2","role":"MID","nickname":"a"}]'),
          '22023: Hay un jugador repetido en la carga (cada jugador, una sola vez)', 'jugador repetido');
SELECT alike(pg_temp.imp('rs-admin', '[{"team":"NAVI","role":"TOP","nickname":"X"}]', true, (SELECT fe FROM rs)), '22023: La edición%',
             'edición de fútbol');
SELECT is((SELECT count(*) FROM lol_roster)::text || '/' || (SELECT count(*) FROM lol_players), (SELECT r || '/' || p FROM n0),
          'atomicidad: los errores no dejan nada a medias');

-- ---------------- Picks y baja ----------------
SELECT is(t.run_as('authenticated', t.uid('rs-admin'), format('SELECT admin_set_lol_roster_picks(%s, ARRAY[''Azir'', '' Orianna '', ''Taliyah''])', pg_temp.rid('Caps'))),
          'ok', 'tres campeones');
SELECT is((SELECT array_to_string(picks, ',') FROM lol_roster WHERE id = pg_temp.rid('Caps')), 'Azir,Orianna,Taliyah', 'picks guardados');
SELECT is(t.run_as('authenticated', t.uid('rs-admin'), format('SELECT admin_set_lol_roster_picks(%s, ARRAY[''A1'',''B2'',''C3'',''D4''])', pg_temp.rid('Caps'))),
          '22023: Como máximo 3 campeones', 'cuatro campeones: no');
SELECT is(t.run_as('authenticated', t.uid('rs-admin'), format('SELECT admin_set_lol_roster_picks(%s, ARRAY[''Kai''''Sa''])', pg_temp.rid('Caps'))),
          '22023: Campeón no válido: usa el identificador de Riot (Ahri, KSante, MonkeyKing…)', 'nombre con apóstrofo: usar el id de Riot');
SELECT is(t.run_as('authenticated', t.uid('rs-user'), format('SELECT admin_remove_lol_roster_entry(%s)', pg_temp.rid('Parus'))) ~ '^42501', true,
          'un USER no quita a nadie');
SELECT is(t.run_as('authenticated', t.uid('rs-admin'), format('SELECT admin_remove_lol_roster_entry(%s)', pg_temp.rid('Parus'))), 'ok', 'un ADMIN quita a Parus');
SELECT is(pg_temp.roster('NAVI'), 'TOP:Maynter:UA', 'Parus fuera; el jugador sigue existiendo para otras ediciones')
  ;

SELECT * FROM finish();
ROLLBACK;
