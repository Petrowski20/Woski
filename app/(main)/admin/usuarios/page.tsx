import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AdminUsuariosManager from '@/components/AdminUsuariosManager'
import type { AdminUserRow } from '@/components/AdminUsuariosManager'

export default async function AdminUsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (myProfile?.role !== 'ADMIN') redirect('/')

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

  return <AdminUsuariosManager users={(data ?? []) as AdminUserRow[]} currentUserId={user.id} />
}
