'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function savePredictionAction(matchId: number, homeGoals: number, awayGoals: number) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No estás autenticado' }

  const { error } = await supabase
    .from('predictions')
    .upsert({
      profile_id: user.id,
      match_id: matchId,
      pred_home_goals: homeGoals,
      pred_away_goals: awayGoals,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'profile_id, match_id',
    })

  if (error) return { error: error.message }

  revalidatePath('/')
  return { success: true }
}
