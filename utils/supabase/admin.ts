import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Cliente con la clave de servicio: salta la RLS y usa la API de
// administración de Auth. Solo en código de servidor y siempre
// después de comprobar profiles.role = 'ADMIN' con el cliente del
// usuario (o, para el propio usuario, su sesión).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
