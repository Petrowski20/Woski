import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LeagueCard from '@/components/LeagueCard'
import { getServerLang, tServer } from '@/utils/i18n-server'

export default async function LigasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const lang = await getServerLang()
  const t = (key: string, vars?: Record<string, string | number>) => tServer(lang, key, vars)

  const { data: rows } = await supabase
    .from('pool_members')
    // pools.join_code ya no es legible para el cliente (ligas congeladas).
    .select('joined_at, pools(id, name, description, created_by)')
    .eq('profile_id', user.id)
    .order('joined_at', { ascending: false })

  type League = {
    id: number
    name: string
    description: string | null
    join_code: string | null
    created_by: string | null
    joined_at: string
  }

  const leagues: League[] = (rows ?? [])
    .map((r: any) => ({
      ...(r.pools as Omit<League, 'joined_at' | 'join_code'>),
      join_code: null,
      joined_at: r.joined_at as string,
    }))
    .filter((l: any) => l?.id)

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('ligas.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('ligas.subtitle')}</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 p-6 text-sm text-gray-600 dark:text-gray-300">
        {t('ligas.frozen')}{' '}
        <Link href="/clubes" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          {t('ligas.goToClubs')}
        </Link>
      </div>

      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
          {leagues.length === 0 ? t('ligas.noLeagues') : t('ligas.myLeagues', { n: leagues.length })}
        </h2>

        {leagues.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-[#FFD6D1] dark:border-slate-700 py-12 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
            <span className="text-4xl">🏆</span>
            <p className="text-sm">{t('ligas.noLeaguesHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {leagues.map((league) => (
              <LeagueCard
                key={league.id}
                league={league}
                userId={user.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
