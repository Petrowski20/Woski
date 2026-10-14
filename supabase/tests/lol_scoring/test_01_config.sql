-- Validación del config v2 (validate_ruleset_config + trigger de rulesets)
BEGIN;
SET search_path = public, extensions, t;
SELECT plan(16);

SELECT lives_ok($$ SELECT validate_ruleset_config(t.cfg_v2()) $$, 'config v2 oficial válido');
SELECT lives_ok($$ SELECT validate_ruleset_config('{"scoring_type":"series","correct_winner_points":1,"exact_score_points":3}') $$,
                'config v1 (sin version) no se valida');
SELECT lives_ok($$ SELECT validate_ruleset_config('{"version":1,"anything":true}') $$, 'version 1 explícita = v1');
SELECT lives_ok($$ SELECT validate_ruleset_config(t.cfg_v2(1, '{"winner_points":{"tiers":[{"min_share":0,"points":1}],"sole_voter_points":1,"min_voters_percent":1,"min_voters_override":3,"fallback_points":1}}')) $$,
                'min_voters_override entero y un solo tramo');

SELECT throws_like($$ SELECT validate_ruleset_config('{"version":3}') $$, '%versión 3 no soportada%', 'versión desconocida');
SELECT throws_like($$ SELECT validate_ruleset_config(t.cfg_v2() - 'winner_points') $$, '%falta el objeto "winner_points"%', 'falta winner_points');
SELECT throws_like($$ SELECT validate_ruleset_config(t.cfg_v2() || '{"typo":1}') $$, '%clave desconocida "typo"%', 'clave desconocida arriba');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{winner_points,tiers}', '[{"min_share":25,"points":3},{"min_share":50,"points":2},{"min_share":0,"points":4}]')) $$,
                   '%de mayor a menor min_share%', 'tramos desordenados');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{exact_score_points,tiers}', '[{"min_share":50,"points":2},{"min_share":25,"points":3}]')) $$,
                   '%min_share 0%', 'el último tramo debe cubrir 0 %');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{winner_points,tiers,0,points}', '"2"')) $$,
                   '%min_share y points numéricos%', 'points como texto');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{winner_points,min_voters_override}', '0')) $$,
                   '%min_voters_override" debe ser null o un entero >= 1%', 'override 0');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{streak_bonus,tiers}', '[{"from":7,"bonus":2},{"from":3,"bonus":1}]')) $$,
                   '%de menor a mayor "from"%', 'rachas desordenadas');
SELECT throws_like($$ SELECT validate_ruleset_config(jsonb_set(t.cfg_v2(), '{perfect_day,negative}', '2')) $$,
                   '%perfect_day.negative" debe ser un entero <= 0%', 'pleno negativo positivo');
SELECT throws_like($$ SELECT validate_ruleset_config(t.cfg_v2() || '{"default_best_of":4}') $$,
                   '%default_best_of" debe ser 1, 3 o 5%', 'best_of inválido');

-- El trigger de rulesets aplica la validación al guardar.
SELECT throws_like($$ INSERT INTO rulesets (name, config) VALUES ('mal', t.cfg_v2() - 'perfect_day') $$,
                   '%falta el objeto "perfect_day"%', 'INSERT de ruleset inválido rechazado');
SELECT lives_ok($$ UPDATE rulesets SET config = config WHERE name = 'LoL Series (default)' $$,
                'rulesets v1 existentes siguen guardándose');

SELECT * FROM finish();
ROLLBACK;
