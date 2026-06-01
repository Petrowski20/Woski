-- ============================================================
-- Añade ON DELETE CASCADE a las FKs críticas de usuario.
-- Cadena resultante:
--   auth.users → profiles → predictions
--                          → profile_leagues
-- ============================================================

-- ── 1. profiles.id → auth.users(id) ─────────────────────────
-- Cuando se elimina un usuario de auth.users, se elimina su perfil.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- ── 2. predictions.profile_id → profiles(id) ─────────────────
-- Cuando se elimina un perfil, se eliminan todas sus predicciones.
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_profile_id_fkey;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_profile_id_fkey
    FOREIGN KEY (profile_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;

-- ── 3. profile_leagues.profile_id → profiles(id) ─────────────
-- Cuando se elimina un perfil, se eliminan todas sus membresías de liga.
ALTER TABLE public.profile_leagues
  DROP CONSTRAINT IF EXISTS profile_leagues_profile_id_fkey;

ALTER TABLE public.profile_leagues
  ADD CONSTRAINT profile_leagues_profile_id_fkey
    FOREIGN KEY (profile_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;

-- ── Verificación (ejecutar opcionalmente para confirmar) ──────
-- SELECT tc.table_name, kcu.column_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND tc.table_name IN ('profiles', 'predictions', 'profile_leagues')
-- ORDER BY tc.table_name, kcu.column_name;
