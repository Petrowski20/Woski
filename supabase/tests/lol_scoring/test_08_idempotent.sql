-- Recálculo idempotente y determinista
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(7);

-- Edición con datos variados: 2 fases, 12 series Bo1/Bo3/Bo5 en
-- 4 jornadas, 9 jugadores con votos pseudoaleatorios fijos.
DO $$
DECLARE
  e   integer := t.edition('idempotent');
  rs  integer := t.ruleset('idem v2', t.cfg_v2(3));
  pa  integer := t.phase(e, rs, 'A', 0);
  pb  integer := t.phase(e, rs, 'B', 1);
  m   integer;
  bo  integer;
  w   integer;
  h   integer;
  a   integer;
BEGIN
  FOR i IN 1..12 LOOP
    bo := (ARRAY[1, 3, 5])[1 + i % 3];
    w  := (bo + 1) / 2;
    m  := t.match(CASE WHEN i <= 8 THEN pa ELSE pb END,
                  TIMESTAMPTZ '2026-09-01 10:00+00' + make_interval(days => (i - 1) / 3, hours => (i - 1) % 3 * 3),
                  bo, p_featured => (i = 4));
    FOR j IN 1..9 LOOP
      CONTINUE WHEN (i * 7 + j * 3) % 5 = 0;                  -- algunos no votan
      IF (i + j) % 2 = 0 THEN h := w; a := (i * j) % w; ELSE h := (i * j) % w; a := w; END IF;
      PERFORM t.vote(t.player('id-' || j), m, h, a);
    END LOOP;
    PERFORM t.finish(m, CASE WHEN i % 3 = 0 THEN 0 ELSE w END, CASE WHEN i % 3 = 0 THEN w ELSE i % w END);
  END LOOP;
  CREATE TEMP TABLE ids AS SELECT e;
END;
$$;

SELECT ok(rescore_lol_edition((SELECT e FROM ids)) > 0, 'primera pasada escribe puntos');
CREATE TEMP TABLE pass1 AS
SELECT pr.id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases ph ON ph.id = mt.phase_id
WHERE ph.edition_id = (SELECT e FROM ids);
CREATE TEMP TABLE st1 AS SELECT * FROM lol_standings_at((SELECT e FROM ids), NULL, NULL);

SELECT is(rescore_lol_edition((SELECT e FROM ids)), 0, 'segunda pasada: no cambia ninguna fila');
SELECT is((SELECT SUM(score_lol_match(mt.id)) FROM matches mt JOIN phases ph ON ph.id = mt.phase_id
           WHERE ph.edition_id = (SELECT e FROM ids))::integer, 0, 'score_lol_match serie a serie: tampoco');

-- Desde cero (puntos borrados a mano) sale exactamente lo mismo.
UPDATE predictions pr SET points_earned = 99, is_correct_winner = NULL, is_correct_score = NULL
FROM matches mt JOIN phases ph ON ph.id = mt.phase_id
WHERE mt.id = pr.match_id AND ph.edition_id = (SELECT e FROM ids);
SELECT ok(rescore_lol_edition((SELECT e FROM ids)) > 0, 'recalcular desde cero');
SELECT set_eq(
  $$ SELECT pr.id, pr.points_earned, pr.is_correct_winner, pr.is_correct_score
     FROM predictions pr JOIN matches mt ON mt.id = pr.match_id JOIN phases ph ON ph.id = mt.phase_id
     WHERE ph.edition_id = (SELECT e FROM ids) $$,
  $$ SELECT * FROM pass1 $$,
  'mismos puntos que la primera pasada');
SELECT set_eq($$ SELECT * FROM lol_standings_at((SELECT e FROM ids), NULL, NULL) $$, $$ SELECT * FROM st1 $$,
              'misma clasificación');
SELECT ok((SELECT COUNT(*) FROM pass1 WHERE points_earned > 0) > 10, 'el fixture reparte puntos (no es trivial)');

SELECT * FROM finish();
ROLLBACK;
