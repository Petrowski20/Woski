-- Premios de una edición (20261101100001_lol_awards): get_lol_awards.
-- Una fase v2 Bo5, una serie por jornada (días 1-6):
--   S1 3-0 · S2 3-1 · S3 0-3 · S4 3-2 · S5 3-0 · S6 1-3
--   aw-ace:   todos exactos
--   aw-uyy:   todos con el ganador y a un mapa del marcador
--   aw-jinx:  todos fallados
--   aw-sleep: como aw-uyy en S1-S3 y no vota S4-S6
--   aw-crowd1..10: solo votan S1 (fallan): el acierto de S1 queda en
--                  minoría (3 de 14) y no llegan al mínimo de votos
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(22);

DO $$
DECLARE
  e  integer := t.edition('premios');
  ph integer := t.phase(e, t.ruleset('premios', t.cfg_v2(5)), 'Grupos', 0);
  ace   uuid := t.player('aw-ace');
  uyy   uuid := t.player('aw-uyy');
  jinx  uuid := t.player('aw-jinx');
  sleep uuid := t.player('aw-sleep');
  s  integer[] := '{}';
  res integer[][] := '{{3,0},{3,1},{0,3},{3,2},{3,0},{1,3}}';
  uy  integer[][] := '{{3,1},{3,2},{1,3},{3,1},{3,1},{2,3}}';
  pool integer;
BEGIN
  FOR i IN 1..6 LOOP
    s := s || t.match(ph, TIMESTAMPTZ '2026-10-01 10:00+00' + (i - 1) * interval '1 day');
  END LOOP;
  PERFORM t.crowd('aw-crowd', 10, s[1], 0, 3);
  FOR i IN 1..6 LOOP
    PERFORM t.vote(ace, s[i], res[i][1], res[i][2]);
    PERFORM t.vote(uyy, s[i], uy[i][1], uy[i][2]);
    PERFORM t.vote(jinx, s[i], res[i][2], res[i][1]);
    IF i <= 3 THEN PERFORM t.vote(sleep, s[i], uy[i][1], uy[i][2]); END IF;
  END LOOP;
  FOR i IN 1..6 LOOP PERFORM t.finish(s[i], res[i][1], res[i][2]); END LOOP;
  PERFORM rescore_lol_edition(e);

  INSERT INTO pools (name, edition_id) VALUES ('pool premios', e) RETURNING id INTO pool;
  INSERT INTO pool_members (profile_id, pool_id, joined_at) VALUES
    (uyy, pool, TIMESTAMPTZ '2026-09-01 00:00+00'),
    (jinx, pool, TIMESTAMPTZ '2026-09-01 00:00+00');
  CREATE TEMP TABLE aw_ids AS SELECT e, ph, pool;
END;
$$;

-- Ganadores de un premio: "nick:valor[:detalle]" por orden de nick.
CREATE FUNCTION pg_temp.w(p_award text, p_pool integer DEFAULT NULL, p_phase integer DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(nickname || ':' || trim_scale(value)::text || COALESCE(':' || detail, ''), ',' ORDER BY nickname)
  FROM get_lol_awards((SELECT e FROM aw_ids), p_pool, p_phase)
  WHERE award = p_award;
$$;

-- ---------------- Los buenos ----------------
SELECT is(pg_temp.w('exact'), 'aw-ace:6', 'Francotirador: aw-ace, 6 exactos');
SELECT is(pg_temp.w('streak'), 'aw-ace:6,aw-uyy:6', 'Racha legendaria: empate compartido a 6');
SELECT is(pg_temp.w('hits'), 'aw-ace:6,aw-uyy:6', 'Más aciertos: empate compartido');
SELECT is(pg_temp.w('accuracy'), 'aw-ace:100,aw-sleep:100,aw-uyy:100', '% de acierto: 100 % los tres (aw-sleep con 3 de 3)');
SELECT is(pg_temp.w('perfect'), 'aw-ace:6,aw-uyy:6', 'Rey de los plenos: 6 jornadas');
SELECT is(pg_temp.w('contrarian'), 'aw-ace:1,aw-sleep:1,aw-uyy:1', 'Contracorriente: el acierto de S1 lo votó 3 de 14');
SELECT is((SELECT string_agg(nickname, ',') FROM get_lol_awards((SELECT e FROM aw_ids)) WHERE award = 'golden_day'),
          'aw-ace', 'Jornada de oro: aw-ace (ganador + exacto)');
SELECT is(pg_temp.w('leader'), 'aw-ace:6', 'El Inamovible: aw-ace líder las 6 jornadas');

-- ---------------- Los de broma ----------------
SELECT is(pg_temp.w('jinx'), 'aw-jinx:6', 'El Gafe: 6 fallos seguidos');
SELECT is(pg_temp.w('negative'), 'aw-jinx:6', 'Pleno negativo: 6 jornadas');
SELECT is(pg_temp.w('uyyy'), 'aw-uyy:6', 'El Uyyy: 6 veces a un mapa');
SELECT is(pg_temp.w('sleeper'), 'aw-sleep:3', 'El Dormilón: 3 sin votar (la multitud no llega a 3 votos)');
SELECT is(pg_temp.w('sheep'), 'aw-ace:5,aw-uyy:5', 'El Borrego: 5 votos con la mayoría');
SELECT is(pg_temp.w('fan'), 'aw-ace:4:AAA,aw-jinx:4:BBB,aw-uyy:4:AAA', 'El Hincha: 4 votos al mismo equipo, con su tag');

-- ---------------- Reglas comunes ----------------
SELECT is((SELECT count(*) FROM get_lol_awards((SELECT e FROM aw_ids)) WHERE nickname LIKE 'aw-crowd%'), 0::bigint,
          'sin el mínimo de votos no se gana nada');
SELECT is((SELECT count(*) FROM get_lol_awards((SELECT e FROM aw_ids)) WHERE value <= 0), 0::bigint,
          'un premio con máximo 0 no tiene ganador');
SELECT is((SELECT count(*) FROM get_lol_awards((SELECT e FROM aw_ids), NULL, (SELECT ph FROM aw_ids))),
          (SELECT count(*) FROM get_lol_awards((SELECT e FROM aw_ids))),
          'con una sola fase, la fase da lo mismo que el total');
SELECT is(pg_temp.w('hits', (SELECT pool FROM aw_ids)), 'aw-uyy:6', 'pool: solo sus miembros');
SELECT is(pg_temp.w('exact', (SELECT pool FROM aw_ids)), NULL, 'pool: nadie con exactos, sin premio');

-- ---------------- Permisos ----------------
SELECT alike(t.run_as('anon', NULL, format('SELECT count(*) FROM get_lol_awards(%s)', (SELECT e FROM aw_ids))),
             '42501:%', 'anon: rechazado');
SELECT ok(has_function_privilege('authenticated', 'get_lol_awards(integer,integer,integer)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'get_lol_awards(integer,integer,integer)', 'EXECUTE'),
          'authenticated sí, service_role no');
SELECT isnt(t.run_as('authenticated', t.uid('aw-ace'), format('SELECT count(*) FROM get_lol_awards(%s)', (SELECT e FROM aw_ids))),
            '0', 'un usuario ve los premios');

SELECT * FROM finish();
ROLLBACK;
