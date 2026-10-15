import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export default async function CambiarContrasenaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="w-full">
      <ChangePasswordForm forced={user.app_metadata?.must_change_password === true} />
    </div>
  )
}
