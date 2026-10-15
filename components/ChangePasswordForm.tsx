'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { useLang } from '@/contexts/LangContext'
import { changePasswordAction } from '@/app/(main)/perfil/contrasena/actions'
import { MIN_PASSWORD_LENGTH } from '@/utils/auth/password'

const inputCls = 'w-full border border-border bg-bg-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors rounded-xl px-3 py-2.5 text-sm'

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const { t } = useLang()
  const router = useRouter()
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [isSaving, startSaving] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw.length < MIN_PASSWORD_LENGTH) { toast.error(t('profile.password.min8')); return }
    if (newPw !== confirmPw) { toast.error(t('profile.password.noCoinciden')); return }

    startSaving(async () => {
      const result = await changePasswordAction(newPw, confirmPw)
      if ('error' in result) {
        toast.error(t(`profile.password.${result.error}`))
        return
      }
      setNewPw('')
      setConfirmPw('')
      toast.success(t('profile.password.success'))
      router.replace(forced ? '/' : '/perfil')
      router.refresh()
    })
  }

  async function handleLogout() {
    await createClient().auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="max-w-sm mx-auto py-6 space-y-4">
      {forced ? (
        <div className="px-4 py-3 bg-warning/10 border border-warning/40 rounded-xl">
          <p className="font-semibold text-warning">{t('profile.password.forzadoTitulo')}</p>
          <p className="text-sm text-text-primary mt-1">{t('profile.password.forzadoTexto')}</p>
        </div>
      ) : (
        <Link href="/perfil" className="text-sm text-accent hover:underline">
          ← {t('profile.password.volver')}
        </Link>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-bg-elevated rounded-panel shadow-card border border-border p-6 flex flex-col gap-3"
      >
        <h1 className="heading-display font-bold text-text-primary mb-2">{t('profile.password.title')}</h1>
        <div>
          <label htmlFor="new-password" className="block text-xs font-medium text-text-muted mb-1.5">
            {t('profile.password.nueva')}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            placeholder={t('profile.password.nuevaPlaceholder')}
            autoFocus
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-medium text-text-muted mb-1.5">
            {t('profile.password.confirmar')}
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder={t('profile.password.confirmarPlaceholder')}
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="mt-1 py-2.5 bg-accent bg-accent-gradient text-on-accent shadow-glow-accent rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-60 disabled:shadow-none disabled:brightness-100 transition-all"
        >
          {isSaving ? t('profile.password.guardando') : t('profile.password.guardar')}
        </button>
      </form>

      {forced && (
        <button
          onClick={handleLogout}
          className="w-full py-3 text-sm font-semibold text-danger bg-bg-elevated hover:bg-danger/10 border border-border hover:border-danger/40 rounded-panel shadow-card transition-colors"
        >
          {t('profile.cerrarSesion')}
        </button>
      )}
    </div>
  )
}
