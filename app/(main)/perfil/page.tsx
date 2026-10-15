import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileManager from '@/components/ProfileManager'
import ProfileLolSection from '@/components/lol/ProfileLolSection'
import { getProfileLolSummary } from '../lol/data'

export const metadata = { title: 'Perfil · Woski' }

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [profileRes, clubsRes, lol] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nickname, role, total_points, avatar_url')
      .eq('id', user.id)
      .single(),
    supabase
      .from('club_members')
      .select('joined_at, clubs!inner(id, name)')
      .eq('profile_id', user.id)
      .order('joined_at', { ascending: true }),
    // Si falla LoL, el resto del perfil sigue funcionando.
    getProfileLolSummary(supabase, user.id).catch(err => {
      console.error('[perfil] lol', err)
      return null
    }),
  ])

  const { data: profile, error } = profileRes
  if (error || !profile) {
    return (
      <div className="p-8 text-center text-danger">
        Error al cargar el perfil.
      </div>
    )
  }
  if (clubsRes.error) console.error('[perfil] clubs', clubsRes.error)

  const clubs = ((clubsRes.data ?? []) as unknown as { clubs: { id: number; name: string } }[])
    .map(r => r.clubs)

  return (
    <div className="w-full">
      <ProfileManager
        initialProfile={profile}
        userEmail={user.email ?? ''}
        clubs={clubs}
        lolSection={
          lol ? (
            <ProfileLolSection editions={lol} />
          ) : (
            <p role="alert" className="rounded-panel bg-danger/10 border border-danger/40 px-5 py-4 text-sm text-text-primary">
              No hemos podido cargar tus datos de LoL. Prueba a recargar la página.
            </p>
          )
        }
      />
    </div>
  )
}
