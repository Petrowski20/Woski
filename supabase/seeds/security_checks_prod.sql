-- ============================================================
--  Comprobaciones de seguridad en producción (SOLO LECTURA)
--
--  Para comparar producción con el volcado del 22/09
--  (backup_pre_domain_model_20260922.sql) antes y después de
--  aplicar 20261016100001..100003.
--
--  No escribe nada: todo va dentro de una transacción READ ONLY
--  que termina en ROLLBACK. Cualquier escritura fallaría con
--  "cannot execute ... in a read-only transaction".
--
--  Uso:
--    psql "$DATABASE_URL" -f supabase/seeds/security_checks_prod.sql
--  En el SQL Editor de Supabase solo se ve el último resultado:
--  ejecutar cada bloque por separado (seleccionarlo y Run), o
--  ejecutar solo el bloque 10 (resumen de alertas).
-- ============================================================

BEGIN TRANSACTION READ ONLY;


-- ---------------- 1. Migraciones aplicadas ----------------
-- Antes de aplicar: la última debería ser 20261015100001.

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;


-- ---------------- 2. Vistas de public y sus permisos ----------------
-- Volcado 22/09: solo v_ranking_global y v_ranking_by_league, owner
-- postgres, GRANT ALL a anon y authenticated.
-- v_ranking_global es auto-actualizable (una sola tabla);
-- v_ranking_by_league no (JOIN), aunque tenga el privilegio.
-- has_table_privilege incluye lo heredado de PUBLIC.

SELECT
  c.relname                                         AS vista,
  CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' END AS tipo,
  pg_get_userbyid(c.relowner)                       AS owner,
  COALESCE(c.reloptions::text, '')                  AS opciones,   -- security_invoker
  v.is_updatable, v.is_insertable_into,
  r.rol,
  has_table_privilege(r.rol, c.oid, 'SELECT')       AS sel,
  has_table_privilege(r.rol, c.oid, 'INSERT')       AS ins,
  has_table_privilege(r.rol, c.oid, 'UPDATE')       AS upd,
  has_table_privilege(r.rol, c.oid, 'DELETE')       AS del,
  has_table_privilege(r.rol, c.oid, 'TRUNCATE')     AS trunc
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN information_schema.views v
  ON v.table_schema = n.nspname AND v.table_name = c.relname
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rol)
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
ORDER BY c.relname, r.rol;


-- ---------------- 3. Columnas de las vistas ----------------
-- Ninguna vista debería exponer role ni is_hidden.

SELECT table_name AS vista, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columnas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
GROUP BY table_name
ORDER BY table_name;


-- ---------------- 4. Reglas / triggers INSTEAD OF en vistas ----------------
-- Si una vista tiene alguno, sería escribible aunque no sea auto-actualizable.
-- Volcado 22/09: ninguno.

SELECT c.relname AS vista, 'rule' AS tipo, r.rulename AS nombre
FROM pg_rewrite r
JOIN pg_class c ON c.oid = r.ev_class
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v' AND r.rulename <> '_RETURN'
UNION ALL
SELECT c.relname, 'trigger', t.tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v' AND NOT t.tgisinternal;


-- ---------------- 5. RLS de las tablas sensibles ----------------
-- Volcado 22/09: ranking_snapshots sin RLS; el resto con RLS.

SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forzada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('profiles', 'pools', 'pool_members', 'predictions', 'matches',
                    'ranking_snapshots', 'clubs', 'club_members', 'app_settings',
                    'teams', 'players', 'games', 'lol_prediction_audit', 'lol_admin_audit')
ORDER BY c.relname;


-- ---------------- 6. pg_policies ----------------
-- Volcado 22/09, profiles:
--   "Permitir lectura de perfiles"  SELECT  authenticated  true
--   profiles_select_all             SELECT  authenticated  true
--   profiles_update_own             UPDATE  authenticated  id = auth.uid()  (USING y WITH CHECK)
-- (private_leagues/profile_leagues pasaron a pools/pool_members el 22/09.)

SELECT tablename, policyname, cmd, roles, permissive, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'pools', 'pool_members', 'predictions', 'matches')
ORDER BY tablename, cmd, policyname;


-- ---------------- 7. role_table_grants de las tablas sensibles ----------------
-- Volcado 22/09: GRANT ALL a anon y authenticated en todas.
-- Tras 100001..100003: profiles, pools, ranking_snapshots y las dos
-- vistas sin INSERT/UPDATE/DELETE/TRUNCATE a nivel de tabla;
-- pool_members sin UPDATE/TRUNCATE; pools sin SELECT de tabla
-- (pasa a columnas, ver bloque 8).

SELECT table_name AS tabla, grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND table_name IN ('profiles', 'pools', 'pool_members', 'predictions', 'matches',
                     'ranking_snapshots', 'clubs', 'club_members', 'app_settings',
                     'teams', 'players', 'games', 'lol_prediction_audit', 'lol_admin_audit',
                     'v_ranking_global', 'v_ranking_by_league')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- ---------------- 8. Privilegios por columna (profiles, pools) ----------------
-- Antes de aplicar: vacío (todo va por GRANT de tabla).
-- Después: profiles UPDATE (avatar_url, last_viewed_league_id, nickname);
-- pools SELECT sin join_code e INSERT (name, description, created_by,
-- club_id, edition_id).

SELECT table_name AS tabla, grantee, privilege_type,
       string_agg(column_name, ', ' ORDER BY column_name) AS columnas
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'pools')
  AND grantee IN ('anon', 'authenticated')
  AND NOT has_table_privilege(grantee, format('public.%I', table_name), privilege_type)
GROUP BY table_name, grantee, privilege_type
ORDER BY table_name, grantee, privilege_type;


-- ---------------- 9. Contexto adicional ----------------

-- 9a. Triggers de profiles (tras 100001: trg_profiles_protect_privileged).
SELECT t.tgname, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 9b. Quién tiene role = ADMIN hoy. Revisar que no haya nadie inesperado:
-- hasta 100001 cualquier usuario con sesión podía ponerse ADMIN.
SELECT id, nickname, created_at
FROM public.profiles
WHERE role = 'ADMIN'
ORDER BY created_at;

-- 9c. EXECUTE de las funciones que toca 100003.
SELECT p.oid::regprocedure AS funcion, p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('calculate_match_points', 'record_ranking_snapshot', 'get_admin_player_ranking')
ORDER BY 1;

-- 9d. Privilegios por defecto de postgres en public. Volcado 22/09:
-- ALL en tablas, secuencias y funciones para anon y authenticated,
-- es decir, toda tabla o vista nueva nace escribible por el cliente.
SELECT pg_get_userbyid(d.defaclrole) AS owner,
       CASE d.defaclobjtype WHEN 'r' THEN 'tablas' WHEN 'S' THEN 'secuencias'
                            WHEN 'f' THEN 'funciones' ELSE d.defaclobjtype::text END AS objetos,
       d.defaclacl AS acl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;


-- ---------------- 10. Resumen de alertas ----------------
-- Antes de aplicar se esperan las alertas del volcado (vistas
-- escribibles, profiles escribible, join_code legible,
-- ranking_snapshots sin RLS). Después de aplicar: sin filas.

WITH roles(rol) AS (VALUES ('anon'), ('authenticated'))
SELECT 'vista escribible' AS alerta, c.relname AS objeto, r.rol AS rol
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN roles r
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  AND (has_table_privilege(r.rol, c.oid, 'INSERT')
    OR has_table_privilege(r.rol, c.oid, 'UPDATE')
    OR has_table_privilege(r.rol, c.oid, 'DELETE')
    OR has_table_privilege(r.rol, c.oid, 'TRUNCATE'))
UNION ALL
SELECT 'vista expone role/is_hidden', table_name, NULL
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('role', 'is_hidden')
  AND table_name IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
UNION ALL
SELECT 'profiles.role actualizable', 'profiles', r.rol
FROM roles r
WHERE has_column_privilege(r.rol, 'public.profiles', 'role', 'UPDATE')
UNION ALL
SELECT 'profiles: INSERT/DELETE', 'profiles', r.rol
FROM roles r
WHERE has_table_privilege(r.rol, 'public.profiles', 'INSERT')
   OR has_table_privilege(r.rol, 'public.profiles', 'DELETE')
UNION ALL
SELECT 'pools.join_code legible', 'pools', r.rol
FROM roles r
WHERE has_column_privilege(r.rol, 'public.pools', 'join_code', 'SELECT')
UNION ALL
SELECT 'tabla sin RLS', c.relname, NULL
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1, 2, 3;


ROLLBACK;
