-- Partido de la jornada: +2 solo si se acierta el ganador, cuenta
-- para la racha, uno por jornada, solo con la votación abierta.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(14);

DO $$
DECLARE
  e    integer := t.edition('featured', 'Europe/Berlin');
  rs   integer := t.ruleset('feat v2', t.cfg_v2(1));
  ph   integer := t.phase(e, rs, 'Swiss', 0);
  pv1  integer := t.phase(e, (SELECT id FROM rulesets WHERE name = 'LoL Series (default)'), 'Fase v1', 1);
  mf   integer := t.match(ph, '2026-09-01 12:00+00', p_featured => true);
  m2   integer := t.match(ph, '2026-09-01 14:00+00');
  mv1  integer := t.match(pv1, '2026-09-02 12:00+00', 1, p_featured => true);
  hit  uuid := t.player('ft-hit');
  miss uuid := t.player('ft-miss');
  -- Futuro: mismo día (12:00 y 13:00 UTC = misma fecha en Berlín)
  d    timestamptz := date_trunc('day', now() + interval '3 days') + interval '12 hours';
  f1   integer;
  f2   integer;
  f3   integer;
BEGIN
  PERFORM t.crowd('ft-crowd', 3, mf, 1, 0);
  PERFORM t.vote(hit, mf, 1, 0);   PERFORM t.vote(miss, mf, 0, 1);
  PERFORM t.crowd('ft-crowd', 3, m2, 1, 0);
  PERFORM t.vote(hit, m2, 1, 0);
  PERFORM t.crowd('ft-crowd', 3, mv1, 1, 0);
  PERFORM t.vote(hit, mv1, 1, 0);
  PERFORM t.finish(mf, 1, 0);
  PERFORM t.finish(m2, 1, 0);
  PERFORM t.finish(mv1, 1, 0);
  PERFORM rescore_lol_edition(e);

  f1 := t.match(ph, d, p_featured => true);
  f2 := t.match(ph, d + interval '1 hour');
  f3 := t.match(ph, d + interval '2 hours');
  CREATE TEMP TABLE ids AS SELECT mf, m2, mv1, f1, f2, f3;
END;
$$;

SELECT is((SELECT featured_bonus FROM lol_score_breakdown(t.uid('ft-hit'), (SELECT mf FROM ids))), 2, 'acierto en el partido de la jornada → +2');
SELECT is(t.pts(t.uid('ft-hit'), (SELECT mf FROM ids)), 4, 'total = base 2 + featured 2');
SELECT is(t.pts(t.uid('ft-miss'), (SELECT mf FROM ids)), 0, 'fallo en el partido de la jornada → 0');
SELECT is((SELECT (explanation -> 'featured' ->> 'match')::boolean FROM lol_score_breakdown(t.uid('ft-miss'), (SELECT mf FROM ids))), true,
          'la explicación indica que era el partido de la jornada');
SELECT is((SELECT streak_length FROM lol_score_breakdown(t.uid('ft-hit'), (SELECT m2 FROM ids))), 2, 'cuenta para la racha como cualquier serie');
SELECT is((SELECT featured_bonus FROM lol_score_breakdown(t.uid('ft-hit'), (SELECT m2 FROM ids))), 0, 'una serie normal no lleva bonus');
SELECT is((SELECT featured_bonus FROM lol_score_breakdown(t.uid('ft-hit'), (SELECT mv1 FROM ids))), 0, 'ruleset v1: el flag se ignora');

-- Reglas del flag
SELECT throws_like($$ SELECT set_lol_featured_match((SELECT m2 FROM ids), true) $$,
                   '%solo se puede cambiar mientras la votación de esa serie está abierta%', 'no se puede marcar una serie ya iniciada');
SELECT throws_like($$ SELECT set_lol_featured_match((SELECT mf FROM ids), false) $$,
                   '%solo se puede cambiar mientras%', 'ni desmarcar una cerrada');
SELECT throws_like($$ SELECT set_lol_featured_match((SELECT f2 FROM ids), true) $$,
                   '%Ya hay un partido de la jornada%', 'máximo uno por jornada');
SELECT lives_ok($$ SELECT set_lol_featured_match((SELECT f1 FROM ids), false) $$, 'desmarcar con la votación abierta');
SELECT lives_ok($$ SELECT set_lol_featured_match((SELECT f2 FROM ids), true) $$, 'marcar otro del mismo día tras desmarcar');
UPDATE matches SET status = 'CANCELLED' WHERE id = (SELECT f2 FROM ids);
SELECT lives_ok($$ SELECT set_lol_featured_match((SELECT f3 FROM ids), true) $$, 'un destacado cancelado no bloquea la jornada');
SELECT throws_like($$ UPDATE matches SET metadata = metadata || '{"featured_match": true}' WHERE id = (SELECT f1 FROM ids) $$,
                   '%Ya hay un partido de la jornada%', 'el trigger también protege un UPDATE directo');

SELECT * FROM finish();
ROLLBACK;
