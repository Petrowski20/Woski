import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AdminSubNav from '@/components/AdminSubNav'
import { parseAdminParams } from '@/utils/admin/tabs'
import UsuariosTab from './_tabs/Usuarios'
import LigasTab from './_tabs/Ligas'
import LolPartidosTab from './_tabs/lol/Partidos'
import LolPrediccionesTab from './_tabs/lol/Predicciones'
import LolRecordatoriosTab from './_tabs/lol/Recordatorios'
import EnConstruccion from './_tabs/EnConstruccion'
import FutbolPartidosTab from './_tabs/futbol/Partidos'
import FutbolPrediccionesTab from './_tabs/futbol/Predicciones'
import FutbolRecordatoriosTab from './_tabs/futbol/Recordatorios'
import FutbolPremiosTab from './_tabs/futbol/Premios'

export const metadata = { title: 'Admin · Woski' }

type SearchParams = Record<string, string | string[] | undefined>

function param(sp: SearchParams, key: string): string | null {
  const v = sp[key]
  return (Array.isArray(v) ? v[0] : v) ?? null
}

// Un solo /admin para todos los deportes: ?deporte=lol|futbol&tab=…
// El rol ADMIN se comprueba aquí (servidor) antes de pintar ninguna pestaña,
// y otra vez en cada acción de servidor y en cada función SQL admin_*.
export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/')

  const sp = await searchParams
  const { sport, tab, redirect: fixed } = parseAdminParams(sp)
  if (fixed) redirect(fixed)

  let content: React.ReactNode
  switch (tab) {
    case 'usuarios':
      content = <UsuariosTab currentUserId={user.id} />
      break
    case 'ligas':
      content = <LigasTab />
      break
    case 'partidos':
      content = sport === 'lol'
        ? <LolPartidosTab userId={user.id} edicion={param(sp, 'edicion')} fase={param(sp, 'fase')} estado={param(sp, 'estado')} />
        : <FutbolPartidosTab />
      break
    case 'predicciones':
      content = sport === 'lol'
        ? <LolPrediccionesTab userId={user.id} edicion={param(sp, 'edicion')} serie={param(sp, 'serie')} />
        : <FutbolPrediccionesTab selectedPlayerId={param(sp, 'player')} />
      break
    case 'recordatorios':
      content = sport === 'lol' ? <LolRecordatoriosTab /> : <FutbolRecordatoriosTab />
      break
    case 'premios':
      content = sport === 'lol' ? <EnConstruccion titulo="Premios" /> : <FutbolPremiosTab />
      break
  }

  return (
    <div className="w-full space-y-6">
      <AdminSubNav sport={sport} tab={tab} />
      {sport === 'futbol' && (
        <p className="rounded-lg border border-border bg-bg-muted/60 px-4 py-2 text-xs text-text-muted">
          ⚽ Fútbol (archivo): pantallas antiguas del Mundial, se conservan tal cual. Algunas pueden no funcionar.
        </p>
      )}
      {content}
    </div>
  )
}
