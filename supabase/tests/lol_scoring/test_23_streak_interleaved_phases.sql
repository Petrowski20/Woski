-- Racha con fases que se solapan en fechas (20261023100001).
-- Cada fase lleva su propia racha: las series de otra fase ni suman
-- ni cortan, ni en el desglose (lo que paga el bonus) ni en la
-- clasificación (racha actual y mejor de la fase en curso).
-- Tramos del seed: 3 → +1, 7 → +2. Resultado real siempre 1-0 (Bo1)
-- o 2-1 (Bo3); "u" acierta o falla según el caso.
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(14);

-- ---------- 1. Grupo A y Grupo B alternando, todo acertado (Bo1, mismo día) ----------
--   A1 B1 A2 B2 A3 B3 → desglose 1, 1, 2, 2, 3 (+1), 3 (+1)
CREATE TEMP TABLE c1 (e integer, ms integer[]);
DO $$
DECLARE
  e  integer := t.edition('fases intercaladas 1');
  rs integer := t.ruleset('intercaladas bo1', t.cfg_v2(1));
  fa integer := t.phase(e, rs, 'Grupo A', 1);
  fb integer := t.phase(e, rs, 'Grupo B', 2);
  u  uuid    := t.player('il1-u');
  ms integer[] := '{}';
  m  integer;
BEGIN
  FOR i IN 1..6 LOOP
    m := t.match(CASE WHEN i % 2 = 1 THEN fa ELSE fb END, TIMESTAMPTZ '2026-10-10 08:00+00' + make_interval(hours => i), 1);
    PERFORM t.vote(u, m, 1, 0);
    PERFORM t.finish(m, 1, 0);
    ms := ms || m;
  END LOOP;
  PERFORM rescore_lol_edition(e);
  INSERT INTO c1 VALUES (e, ms);
END;
$$;

SELECT is((SELECT string_agg(b.streak_length || CASE WHEN b.streak_bonus > 0 THEN '+' || b.streak_bonus ELSE '' END, ' ' ORDER BY i)
           FROM c1, generate_series(1, 6) i
           CROSS JOIN LATERAL lol_score_breakdown(t.uid('il1-u'), c1.ms[i]) b),
          '1 1 2 2 3+1 3+1', 'alternando A/B: el desglose cuenta cada fase por separado');
SELECT is((SELECT current_streak || '/' || best_streak FROM c1, t.standing(c1.e, t.uid('il1-u'))), '3/3',
          'alternando A/B: clasificación = racha de la fase en curso (3), no 1');
SELECT is((SELECT current_streak || '/' || best_streak FROM c1, t.standing(c1.e, t.uid('il1-u'), NULL, DATE '2026-10-10')), '3/3',
          'alternando A/B: igual con fecha de corte');

-- ---------- 2. Un fallo en la otra fase no corta (Bo1, un día por serie) ----------
--   10/10 A ✓   11/10 B ✗   12/10 A ✓   13/10 B ✓   14/10 A ✓
CREATE TEMP TABLE c2 (e integer, ms integer[]);
DO $$
DECLARE
  e  integer := t.edition('fases intercaladas 2');
  rs integer := t.ruleset('intercaladas 2 bo1', t.cfg_v2(1));
  fa integer := t.phase(e, rs, 'Grupo A', 1);
  fb integer := t.phase(e, rs, 'Grupo B', 2);
  u  uuid    := t.player('il2-u');
  ok boolean[] := ARRAY[true, false, true, true, true];
  ms integer[] := '{}';
  m  integer;
BEGIN
  FOR i IN 1..5 LOOP
    m := t.match(CASE WHEN i % 2 = 1 THEN fa ELSE fb END, TIMESTAMPTZ '2026-10-10 12:00+00' + make_interval(days => i - 1), 1);
    PERFORM t.vote(u, m, CASE WHEN ok[i] THEN 1 ELSE 0 END, CASE WHEN ok[i] THEN 0 ELSE 1 END);
    PERFORM t.finish(m, 1, 0);
    ms := ms || m;
  END LOOP;
  PERFORM rescore_lol_edition(e);
  INSERT INTO c2 VALUES (e, ms);
END;
$$;

SELECT is((SELECT string_agg(b.streak_length::text, ' ' ORDER BY i)
           FROM c2, generate_series(1, 5) i
           CROSS JOIN LATERAL lol_score_breakdown(t.uid('il2-u'), c2.ms[i]) b),
          '1 0 2 1 3', 'fallo en B: el desglose de A sigue (1, 2, 3)');
SELECT is((SELECT streak_bonus FROM c2, lol_score_breakdown(t.uid('il2-u'), c2.ms[5])), 1,
          'fallo en B: A3 llega a 3 y paga +1');
SELECT is((SELECT current_streak || '/' || best_streak FROM c2, t.standing(c2.e, t.uid('il2-u'))), '3/3',
          'fallo en B: clasificación final (fase A) 3/3');
SELECT is((SELECT current_streak || '/' || best_streak FROM c2, t.standing(c2.e, t.uid('il2-u'), NULL, DATE '2026-10-13')), '1/1',
          'corte el 13/10 (fase B): 1/1, solo cuenta B');
SELECT is((SELECT current_streak || '/' || best_streak FROM c2, t.standing(c2.e, t.uid('il2-u'), NULL, DATE '2026-10-12')), '2/2',
          'corte el 12/10 (fase A): 2/2, el fallo de B no corta');
SELECT is((SELECT current_streak || '/' || best_streak FROM c2, t.standing(c2.e, t.uid('il2-u'), NULL, DATE '2026-10-11')), '0/0',
          'corte el 11/10 (fase B): 0/0');

-- ---------- 3. Strict (exact_as_prediction), Bo3, intercaladas ----------
--   10/10 A ✓✓   11/10 B ✓✓   12/10 A ✓✓   13/10 B ✓✗
CREATE TEMP TABLE c3 (e integer, ms integer[]);
DO $$
DECLARE
  e  integer := t.edition('fases intercaladas 3');
  rs integer := t.ruleset('intercaladas estricta', t.cfg_v2(3, '{"streak_bonus": {"scope": "phase",
                  "tiers": [{"from":3,"bonus":1},{"from":7,"bonus":2}],
                  "count_exact_score": true, "exact_as_prediction": true}}'));
  fa integer := t.phase(e, rs, 'Grupo A', 1);
  fb integer := t.phase(e, rs, 'Grupo B', 2);
  u  uuid    := t.player('il3-u');
  ex boolean[] := ARRAY[true, true, true, false];
  ms integer[] := '{}';
  m  integer;
BEGIN
  FOR i IN 1..4 LOOP
    m := t.match(CASE WHEN i % 2 = 1 THEN fa ELSE fb END, TIMESTAMPTZ '2026-10-10 12:00+00' + make_interval(days => i - 1));
    PERFORM t.vote(u, m, 2, CASE WHEN ex[i] THEN 1 ELSE 0 END);
    PERFORM t.finish(m, 2, 1);
    ms := ms || m;
  END LOOP;
  PERFORM rescore_lol_edition(e);
  INSERT INTO c3 VALUES (e, ms);
END;
$$;

SELECT is((SELECT string_agg(b.explanation -> 'streak' -> 'steps' -> 0 ->> 'length', ' ' ORDER BY i)
                  || ' / ' ||
                  string_agg(b.explanation -> 'streak' -> 'steps' -> 1 ->> 'length', ' ' ORDER BY i)
           FROM c3, generate_series(1, 4) i
           CROSS JOIN LATERAL lol_score_breakdown(t.uid('il3-u'), c3.ms[i]) b),
          '1 1 3 3 / 2 2 4 0', 'strict intercalada: ganador 1, 1, 3, 3 / marcador 2, 2, 4, 0');
SELECT is((SELECT current_streak || '/' || best_streak FROM c3, t.standing(c3.e, t.uid('il3-u'))), '0/3',
          'strict: final (fase B, marcador fallado) 0/3');
SELECT is((SELECT current_streak || '/' || best_streak FROM c3, t.standing(c3.e, t.uid('il3-u'), NULL, DATE '2026-10-12')), '4/4',
          'strict: corte el 12/10 (fase A) 4/4, B en medio no corta');

-- ---------- 4. Fases seguidas: sin cambios ----------
--   A ✓ ✓ ✓ (10/10) y luego B ✓ (11/10): la fase en curso es B.
CREATE TEMP TABLE c4 (e integer);
DO $$
DECLARE
  e  integer := t.edition('fases seguidas');
  rs integer := t.ruleset('seguidas bo1', t.cfg_v2(1));
  fa integer := t.phase(e, rs, 'Grupo A', 1);
  fb integer := t.phase(e, rs, 'Grupo B', 2);
  u  uuid    := t.player('il4-u');
  m  integer;
BEGIN
  FOR i IN 1..4 LOOP
    m := t.match(CASE WHEN i <= 3 THEN fa ELSE fb END, TIMESTAMPTZ '2026-10-10 08:00+00' + make_interval(days => i / 4, hours => i), 1);
    PERFORM t.vote(u, m, 1, 0);
    PERFORM t.finish(m, 1, 0);
  END LOOP;
  PERFORM rescore_lol_edition(e);
  INSERT INTO c4 VALUES (e);
END;
$$;

SELECT is((SELECT current_streak || '/' || best_streak FROM c4, t.standing(c4.e, t.uid('il4-u'))), '1/1',
          'fases seguidas: la racha de B empieza de 0 (1/1)');
SELECT is((SELECT current_streak || '/' || best_streak FROM c4, t.standing(c4.e, t.uid('il4-u'), NULL, DATE '2026-10-10')), '3/3',
          'fases seguidas: corte el 10/10 (fase A) 3/3');

SELECT * FROM finish();
ROLLBACK;
