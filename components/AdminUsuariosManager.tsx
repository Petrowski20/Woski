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
        <h1 className="heading-display text-2xl font-bold text-text-primary">🔑 Usuarios</h1>
        <p className="text-sm text-text-muted mt-1">
          Correos, clubes y último acceso. Reinicia contraseñas y oculta jugadores.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar por nickname, correo o club"
        className="w-full mb-4 border border-border bg-bg-muted text-text-primary rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent placeholder:text-text-muted"
      />

      <p className="text-xs text-text-muted mb-2">
        {filtered.length} de {users.length} usuarios
      </p>

      <div className="bg-bg-elevated rounded-card shadow-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-muted/60 border-b border-border font-display text-xs uppercase tracking-display text-text-muted">
              <th className="px-4 py-3 text-left">Usuario</th>
              <th className="px-3 py-3 text-left">Rol</th>
              <th className="px-3 py-3 text-left">Clubes</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Último acceso</th>
              <th className="px-3 py-3 text-center">Visible</th>
              <th className="px-4 py-3 text-right">Contraseña</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(u => {
              const isHidden = hiddenMap[u.id]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className={isHidden ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">
                      {u.nickname}
                      {isSelf && <span className="ml-2 text-[10px] font-normal text-text-muted">tú</span>}
                    </div>
                    <div className="text-xs text-text-muted break-all">{u.email ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold ${u.role === 'ADMIN' ? 'text-secondary' : 'text-text-muted'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-text-muted">
                    {u.clubs.length > 0 ? u.clubs.join(', ') : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-text-muted whitespace-nowrap">
                    {formatDate(u.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleHidden(u.id)}
                      disabled={pendingMap[u.id]}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                        isHidden
                          ? 'border-border text-text-muted'
                          : 'border-success/40 bg-success/10 text-success'
                      }`}
                    >
                      {isHidden ? 'Oculto' : 'Visible'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {mustChangeMap[u.id] && (
                      <span className="mr-2 text-[10px] text-warning">pendiente de cambio</span>
                    )}
                    {isSelf ? (
                      <span className="text-xs text-text-muted">desde tu perfil</span>
                    ) : u.role === 'ADMIN' ? (
                      <span
                        className="text-xs text-text-muted"
                        title="La contraseña de un administrador no se puede reiniciar desde el panel"
                      >
                        admin: no se puede reiniciar
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmUser(u)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
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
          <h3 className="heading-display font-bold text-text-primary mb-2">Reiniciar contraseña</h3>
          <p className="text-sm text-text-muted">
            Se generará una contraseña temporal para <strong>{confirmUser.nickname}</strong>, se cerrarán
            sus sesiones abiertas y tendrá que cambiarla al entrar. La verás una sola vez.
          </p>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => setConfirmUser(null)}
              disabled={isResetting}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-text-primary hover:bg-bg-muted hover:border-accent/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmReset}
              disabled={isResetting}
              className="flex-1 py-2.5 bg-danger text-on-accent rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-60 disabled:brightness-100 transition-colors"
            >
              {isResetting ? 'Reiniciando…' : 'Reiniciar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Contraseña temporal: una sola vez */}
      {revealed && (
        <Modal onClose={() => setRevealed(null)}>
          <h3 className="heading-display font-bold text-text-primary mb-2">Contraseña temporal de {revealed.nickname}</h3>
          <p className="text-sm text-text-muted mb-3">
            Cópiala y pásasela por un canal privado. Al cerrar este aviso no se puede volver a ver.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all font-mono text-base tracking-wider bg-bg-muted text-text-primary ring-1 ring-inset ring-border rounded-lg px-3 py-2 break-all">
              {revealed.password}
            </code>
            <button
              onClick={copyPassword}
              className="shrink-0 px-3 py-2 bg-accent bg-accent-gradient text-on-accent shadow-glow-accent rounded-lg text-sm font-semibold hover:brightness-110 transition-colors"
            >
              Copiar
            </button>
          </div>
          <button
            onClick={() => setRevealed(null)}
            className="w-full mt-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-primary hover:bg-bg-muted hover:border-accent/50 transition-colors"
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
      <div className="fixed inset-0 bg-overlay backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-0 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 bg-bg-elevated border-t border-border sm:border rounded-t-3xl sm:rounded-2xl shadow-raised p-6">
        {children}
      </div>
    </>
  )
}
