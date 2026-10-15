'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { useLang } from '@/contexts/LangContext'
import { changePasswordAction } from '@/app/(main)/perfil/contrasena/actions'
import { MIN_PASSWORD_LENGTH } from '@/utils/auth/password'

const inputCls = 'w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-slate-500'

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
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <p className="font-semibold text-amber-800 dark:text-amber-300">{t('profile.password.forzadoTitulo')}</p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">{t('profile.password.forzadoTexto')}</p>
        </div>
      ) : (
        <Link href="/perfil" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← {t('profile.password.volver')}
        </Link>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-6 flex flex-col gap-3"
      >
        <h1 className="font-bold text-gray-900 dark:text-white mb-2">{t('profile.password.title')}</h1>
        <div>
          <label htmlFor="new-password" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
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
          <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
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
          className="mt-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {isSaving ? t('profile.password.guardando') : t('profile.password.guardar')}
        </button>
      </form>

      {forced && (
        <button
          onClick={handleLogout}
          className="w-full py-3 text-sm font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-sm transition-colors"
        >
          {t('profile.cerrarSesion')}
        </button>
      )}
    </div>
  )
}
