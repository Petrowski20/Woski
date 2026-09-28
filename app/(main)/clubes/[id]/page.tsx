import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getActiveEditions } from '@/utils/editions'
import ClubLogo from '@/components/clubes/ClubLogo'
import { MemberRoleButton, OpenPoolForm, PoolMembershipButton } from '@/components/clubes/ClubControls'
import { ROLE_LABEL, type ClubRole } from '../types'

const ROLE_ORDER: Record<ClubRole, number> = { owner: 0, admin: 1, member: 2 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('clubs').select('name').eq('id', Number(id) || 0).maybeSingle()
  return { title: data ? `${data.name} · Woski` : 'Club · Woski' }
}

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clubId = Number(id)
  if (!Number.isInteger(clubId) || clubId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS: solo los miembros ven el club (y su código).
  const [clubRes, membersRes, poolsRes] = await Promise.all([
    supabase.from('clubs').select('id, name, logo_url, join_code').eq('id', clubId).maybeSingle(),
    supabase
      .from('club_members')
      .select('profile_id, role, joined_at, profiles(nickname, avatar_url)')
      .eq('club_id', clubId),
    supabase
      .from('pools')
      .select('id, name, edition_id, editions(name, competitions(name))')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  ])
  if (clubRes.error) console.error('[clubes] club', clubRes.error)
  if (membersRes.error) console.error('[clubes] members', membersRes.error)
  if (poolsRes.error) console.error('[clubes] pools', poolsRes.error)

  const club = clubRes.data
  type MemberRow = {
    profile_id: string
    role: ClubRole
    joined_at: string | null
    profiles: { nickname: string; avatar_url: string | null } | null
  }
  const members = ((membersRes.data ?? []) as unknown as MemberRow[])
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.joined_at ?? '').localeCompare(b.joined_at ?? ''))
  const myRole = members.find(m => m.profile_id === user.id)?.role
  if (!club || !myRole) notFound()

  type PoolRow = {
    id: number
    name: string
    edition_id: number | null
    editions: { name: string; competitions: { name: string } | null } | null
  }
  const pools = (poolsRes.data ?? []) as unknown as PoolRow[]

  const { data: myPoolRows } = pools.length
    ? await supabase.from('pool_members').select('pool_id').eq('profile_id', user.id).in('pool_id', pools.map(p => p.id))
    : { data: [] }
  const myPools = new Set((myPoolRows ?? []).map(r => r.pool_id as number))

  const canManagePools = myRole === 'owner' || myRole === 'admin'
  let openableEditions: Awaited<ReturnType<typeof getActiveEditions>> = []
  if (canManagePools) {
    const taken = new Set(pools.map(p => p.edition_id))
    try {
      openableEditions = (await getActiveEditions(supabase)).filter(e => !taken.has(e.id))
    } catch {
      // Ya registrado; sin la lista solo se oculta el selector.
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/clubes" className="text-xs text-text-muted hover:text-text-primary">← Mis clubs</Link>
        <div className="mt-2 flex items-center gap-4">
          <ClubLogo url={club.logo_url} name={club.name} size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-text-primary truncate">{club.name}</h1>
            <p className="text-sm text-text-muted">
              Tu rol: {ROLE_LABEL[myRole]} · Código para invitar:{' '}
              <span className="font-mono font-semibold text-text-primary tracking-widest">{club.join_code}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Pools */}
      <section className="bg-bg-elevated rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Pools</h2>
        {pools.length === 0 ? (
          <p className="text-sm text-text-muted">Este club todavía no juega ninguna competición.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pools.map(pool => {
              const edition = pool.editions
                ? `${pool.editions.competitions?.name ?? ''} ${pool.editions.name}`.trim()
                : 'Sin edición'
              const joined = myPools.has(pool.id)
              return (
                <li key={pool.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{edition}</p>
                    <p className="text-xs text-text-muted">{joined ? 'Unido' : 'No juegas este pool'}</p>
                  </div>
                  <PoolMembershipButton poolId={pool.id} joined={joined} />
                </li>
              )
            })}
          </ul>
        )}

        {canManagePools && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Abrir pool</p>
            <OpenPoolForm clubId={club.id} editions={openableEditions} />
          </div>
        )}
      </section>

      {/* Miembros */}
      <section className="bg-bg-elevated rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Miembros ({members.length})</h2>
        <ul className="divide-y divide-border">
          {members.map(m => {
            const nickname = m.profiles?.nickname ?? 'Usuario'
            return (
              <li key={m.profile_id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/jugador/${m.profile_id}`} className="text-sm text-text-primary hover:underline truncate">
                  {nickname}{m.profile_id === user.id && <span className="text-text-muted"> (tú)</span>}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                    m.role === 'member' ? 'bg-bg-muted text-text-muted' : 'bg-accent/15 text-accent'
                  }`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                  {myRole === 'owner' && m.role !== 'owner' && (
                    <MemberRoleButton clubId={club.id} profileId={m.profile_id} role={m.role} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
