-- Tabla singleton para flags globales de la app.
-- Primer uso: permitir al admin previsualizar el podio de campeón en
-- /clasificacion sin depender de que el partido 104 (final) esté FINISHED.
CREATE TABLE public.app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  podium_test_enabled boolean NOT NULL DEFAULT false
);

INSERT INTO public.app_settings (id, podium_test_enabled) VALUES (1, false);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer (la usa la página pública de clasificación).
-- La escritura se hace desde el server action con el cliente SERVICE_ROLE,
-- tras verificar en código que el usuario es ADMIN (mismo patrón que profiles.is_hidden).
CREATE POLICY "app_settings_select_all"
  ON public.app_settings FOR SELECT USING (true);
