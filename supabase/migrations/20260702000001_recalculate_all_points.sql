-- ============================================================
--  Recalcular puntos de todas las predicciones ya finalizadas
--
--  Motivo: updatePlayerPredictionAction (edición manual de
--  predicciones desde /admin/predicciones) tenía una copia vieja
--  del cálculo de puntos que no aplicaba la lógica de "Ganador
--  Absoluto" en eliminatorias. Cualquier predicción que un admin
--  haya introducido/editado a mano para un partido ya finalizado
--  pudo quedar mal puntuada (p. ej. empate + penaltis acertados
--  contando 0 en vez de 1).
--
--  calculate_match_points ya tiene la lógica correcta (v3, ver
--  20260602000003_fix_absolute_winner.sql) y es idempotente: usa
--  el resultado ya guardado en matches, así que volver a llamarla
--  para cada partido FINISHED no cambia nada en los casos que ya
--  estaban bien y corrige los que no.
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, home_goals, away_goals
    FROM public.matches
    WHERE status = 'FINISHED'
    ORDER BY match_date ASC
  LOOP
    PERFORM public.calculate_match_points(r.id, r.home_goals, r.away_goals);
  END LOOP;
END $$;
