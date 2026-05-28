import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'

export default async function JugadorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nickname, role, total_points, avatar_url')
    .eq('id', id)
    .single()

  if (!profile) notFound()

  const { data: predictions } = await supabase
    .from('predictions')
    .select('points_earned, matches!inner(status)')
    .eq('profile_id', id)
    .eq('matches.status', 'FINISHED')

  const total = predictions?.length ?? 0
  const correct = predictions?.filter((p) => (p.points_earned ?? 0) > 0).length ?? 0
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  const initials = profile.nickname.slice(0, 2).toUpperCase()

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white">
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-blue-400 flex-shrink-0 flex items-center justify-center border-4 border-white/30">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.nickname}
                  fill
                  className="object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-white">{initials}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{profile.nickname}</h1>
                {profile.role === 'ADMIN' && (
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold uppercase tracking-wide">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-blue-200 text-sm mt-1">Jugador</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1 bg-blue-50 rounded-xl p-5 text-center">
              <p className="text-4xl font-extrabold text-blue-700">{profile.total_points}</p>
              <p className="text-xs text-blue-500 font-semibold mt-1 uppercase tracking-wide">Puntos totales</p>
            </div>
            <div className="bg-green-50 rounded-xl p-5 text-center">
              <p className="text-3xl font-extrabold text-green-700">
                {correct}
                <span className="text-lg font-medium text-green-400">/{total}</span>
              </p>
              <p className="text-xs text-green-600 font-semibold mt-1 uppercase tracking-wide">Aciertos</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5 text-center">
              <p className="text-3xl font-extrabold text-gray-700">
                {accuracy}
                <span className="text-lg font-medium text-gray-400">%</span>
              </p>
              <p className="text-xs text-gray-500 font-semibold mt-1 uppercase tracking-wide">Precisión</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
