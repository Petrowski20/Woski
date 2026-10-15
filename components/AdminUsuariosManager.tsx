'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setPlayerHiddenAction } from '@/app/(main)/admin/actions'
import { resetUserPasswordAction } from '@/app/(main)/admin/usuarios/actions'

export interface AdminUserRow {
  id: string
  nickname: string
  email: string | null
  role: string
  is_hidden: boolean
  clubs: string[]
  last_sign_in_at: string | null
  created_at: string
  must_change_password: boolean
}

interface Props {
  users: AdminUserRow[]
  currentUserId: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminUsuariosManager({ users, currentUserId }: Props) {
  const [query, setQuery] = useState('')
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>(
    Object.fromEntries(users.map(u => [u.id, u.is_hidden]))
  )
  const [mustChangeMap, setMustChangeMap] = useState<Record<string, boolean>>(
    Object.fromEntries(users.map(u => [u.id, u.must_change_password]))
  )
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({})
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null)
  // La contraseña temporal vive solo aquí hasta cerrar el aviso.
  const [revealed, setRevealed] = useState<{ nickname: string; password: string } | null>(null)
  const [isResetting, startReset] = useTransition()
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.nickname.toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q)
      || u.clubs.some(c => c.toLowerCase().includes(q))
    )
  }, [users, query])

  function toggleHidden(id: string) {
    const newValue = !hiddenMap[id]
    setHiddenMap(prev => ({ ...prev, [id]: newValue }))
    setPendingMap(prev => ({ ...prev, [id]: true }))
    startTransition(async () => {
      const result = await setPlayerHiddenAction(id, newValue)
      setPendingMap(prev => ({ ...prev, [id]: false }))
      if (result.error) {
        setHiddenMap(prev => ({ ...prev, [id]: !newValue }))
        toast.error(result.error)
      }
    })
  }

  function confirmReset() {
    const target = confirmUser
    if (!target) return
    startReset(async () => {
      const result = await resetUserPasswordAction(target.id)
      setConfirmUser(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setMustChangeMap(prev => ({ ...prev, [target.id]: true }))
      setRevealed({ nickname: target.nickname, password: result.password })
    })
  }

  async function copyPassword() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.password)
      toast.success('Contraseña copiada')
    } catch {
      toast.error('No se pudo copiar; selecciónala a mano')
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🔑 Usuarios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Correos, clubes y último acceso. Reinicia contraseñas y oculta jugadores.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar por nickname, correo o club"
        className="w-full mb-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-slate-500"
      />

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {filtered.length} de {users.length} usuarios
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 border-b border-[#FFD6D1] dark:border-slate-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 text-left">Usuario</th>
              <th className="px-3 py-3 text-left">Rol</th>
              <th className="px-3 py-3 text-left">Clubes</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Último acceso</th>
              <th className="px-3 py-3 text-center">Visible</th>
              <th className="px-4 py-3 text-right">Contraseña</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {filtered.map(u => {
              const isHidden = hiddenMap[u.id]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className={isHidden ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {u.nickname}
                      {isSelf && <span className="ml-2 text-[10px] font-normal text-gray-400">tú</span>}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{u.email ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold ${u.role === 'ADMIN' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {u.clubs.length > 0 ? u.clubs.join(', ') : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {formatDate(u.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleHidden(u.id)}
                      disabled={pendingMap[u.id]}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                        isHidden
                          ? 'border-gray-300 text-gray-500 dark:border-slate-600 dark:text-slate-400'
                          : 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                      }`}
                    >
                      {isHidden ? 'Oculto' : 'Visible'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {mustChangeMap[u.id] && (
                      <span className="mr-2 text-[10px] text-amber-600 dark:text-amber-400">pendiente de cambio</span>
                    )}
                    {isSelf ? (
                      <span className="text-xs text-gray-400">desde tu perfil</span>
                    ) : (
                      <button
                        onClick={() => setConfirmUser(u)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Reiniciar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmación */}
      {confirmUser && (
        <Modal onClose={() => !isResetting && setConfirmUser(null)}>
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">Reiniciar contraseña</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Se generará una contraseña temporal para <strong>{confirmUser.nickname}</strong>, se cerrarán
            sus sesiones abiertas y tendrá que cambiarla al entrar. La verás una sola vez.
          </p>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => setConfirmUser(null)}
              disabled={isResetting}
              className="flex-1 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmReset}
              disabled={isResetting}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:bg-red-400 transition-colors"
            >
              {isResetting ? 'Reiniciando…' : 'Reiniciar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Contraseña temporal: una sola vez */}
      {revealed && (
        <Modal onClose={() => setRevealed(null)}>
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">Contraseña temporal de {revealed.nickname}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Cópiala y pásasela por un canal privado. Al cerrar este aviso no se puede volver a ver.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all font-mono text-base tracking-wider bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 break-all">
              {revealed.password}
            </code>
            <button
              onClick={copyPassword}
              className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Copiar
            </button>
          </div>
          <button
            onClick={() => setRevealed(null)}
            className="w-full mt-5 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Hecho, cerrar
          </button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-0 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 sm:border rounded-t-3xl sm:rounded-2xl shadow-2xl p-6">
        {children}
      </div>
    </>
  )
}
