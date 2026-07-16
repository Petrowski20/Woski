import { createClient } from '@/utils/supabase/server'
import PodiumTop3 from '@/components/PodiumTop3'
import ClasificacionToggle from '@/components/ClasificacionToggle'

export default async function PruebasPage() {
  const supabase = await createClient()

  const { data: rankingData } = await supabase
    .from('v_ranking_global')
    .select('profile_id, nickname, total_points, avatar_url')
    .order('total_points', { ascending: false })
    .limit(5)

  const top5 = (rankingData ?? []).map((r: any) => ({
    profileId: r.profile_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url ?? null,
    pts: r.total_points,
  }))

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 px-4 py-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          🧪 Página de pruebas — no enlazada desde ningún menú, no afecta a la clasificación real.
        </p>
      </div>

      <ClasificacionToggle>
        <PodiumTop3
          top3={top5.slice(0, 3)}
          next2={top5.slice(3, 5)}
          title="🏆 ¡Tenemos campeón del Mundial!"
          subtitle="Vista previa del podio — datos reales del ranking global actual"
        />
      </ClasificacionToggle>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Al cambiar a &quot;Normal&quot; se oculta este bloque especial — en /clasificacion, debajo de esto
        (en ambos modos) sigue apareciendo la tabla completa de siempre, sin cambios.
      </p>
    </div>
  )
}
