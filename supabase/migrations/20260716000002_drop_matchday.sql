-- La columna matchday (matches.matchday) se eliminó manualmente en producción
-- por estar siempre a NULL. Esta migración solo sincroniza el historial local
-- con el estado real de la base de datos remota.
ALTER TABLE public.matches DROP COLUMN IF EXISTS matchday;
