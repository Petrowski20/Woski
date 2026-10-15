import { createClient } from '@/utils/supabase/server'
import AdminUsuariosManager from '@/components/AdminUsuariosManager'
import type { AdminUserRow } from '@/components/AdminUsuariosManager'

// Usuarios: igual para todos los deportes. Antes era /admin/usuarios. El rol
// ADMIN lo comprueba /admin/page.tsx.
export default async function UsuariosTab({ currentUserId }: { currentUserId: string }) {
  const supabase = await createClient()

  // admin_list_users comprueba ADMIN otra vez en la base de datos; los
  // correos de auth.users no salen de ahí para nadie más.
  const { data, error } = await supabase.rpc('admin_list_users')

  if (error) {
    return (
      <div className="p-8 text-center text-danger">
        <p className="font-semibold">Error cargando usuarios</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  return <AdminUsuariosManager users={(data ?? []) as AdminUserRow[]} currentUserId={currentUserId} />
}
