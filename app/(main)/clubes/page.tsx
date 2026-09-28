import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ClubForms from '@/components/clubes/ClubForms'
import ClubLogo from '@/components/clubes/ClubLogo'
import { ROLE_LABEL, type ClubRole } from './types'

export const metadata = { title: 'Mis clubs · Woski' }

export default async function ClubesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('club_members')
    .select('role, joined_at, clubs!inner(id, name, logo_url)')
    .eq('profile_id', user.id)
    .order('joined_at', { ascending: true })
  if (error) console.error('[clubes] list', error)

  type Row = { role: ClubRole; clubs: { id: number; name: string; logo_url: string | null } }
  const clubs = ((data ?? []) as unknown as Row[]).map(r => ({ ...r.clubs, role: r.role }))

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Mis clubs</h1>
        <p className="text-sm text-text-muted mt-1">
          Tu grupo de siempre. Cada club abre un pool por competición para jugarla entre vosotros.
        </p>
      </div>

      <ClubForms />

      <div className="mt-8">
        {clubs.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-10 border border-dashed border-border rounded-xl">
            Todavía no estás en ningún club. Crea uno o únete con un código.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {clubs.map(club => (
              <li key={club.id}>
                <Link
                  href={`/clubes/${club.id}`}
                  className="flex items-center gap-3 bg-bg-elevated rounded-xl border border-border p-4 hover:border-accent/50 transition-colors"
                >
                  <ClubLogo url={club.logo_url} name={club.name} size={40} />
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{club.name}</p>
                    <p className="text-xs text-text-muted">{ROLE_LABEL[club.role]}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
