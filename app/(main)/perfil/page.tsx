import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileManager from '@/components/ProfileManager'

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, nickname, role, total_points, avatar_url')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return (
      <div className="p-8 text-center text-danger">
        Error al cargar el perfil.
      </div>
    )
  }

  return (
    <div className="w-full">
      <ProfileManager
        initialProfile={profile}
        userEmail={user.email ?? ''}
      />
    </div>
  )
}
