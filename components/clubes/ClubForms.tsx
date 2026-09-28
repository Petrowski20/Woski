'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClubAction, joinClubAction } from '@/app/(main)/clubes/actions'

const inputClass =
  'w-full px-3 py-2 rounded-lg text-sm bg-bg-muted border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40'
const buttonClass =
  'px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-on-accent hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'

/** Crear un club o unirse a uno con código. */
export default function ClubForms() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [code, setCode] = useState('')
  const [creating, startCreate] = useTransition()
  const [joining, startJoin] = useTransition()

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('El nombre del club es obligatorio.'); return }
    startCreate(async () => {
      const result = await createClubAction(name, logoUrl)
      if (result.error !== null) { toast.error(result.error); return }
      toast.success('Club creado')
      router.push(`/clubes/${result.clubId}`)
    })
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { toast.error('Escribe el código del club.'); return }
    startJoin(async () => {
      const result = await joinClubAction(code)
      if (result.error !== null) { toast.error(result.error); return }
      toast.success(result.alreadyMember ? `Ya eras miembro de "${result.clubName}"` : `Te has unido a "${result.clubName}"`)
      router.push(`/clubes/${result.clubId}`)
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form onSubmit={handleCreate} className="bg-bg-elevated rounded-xl border border-border p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Crear un club</h2>
        <input
          className={inputClass}
          placeholder="Nombre del club"
          maxLength={60}
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="URL del logo (opcional, https)"
          type="url"
          value={logoUrl}
          onChange={e => setLogoUrl(e.target.value)}
        />
        <button type="submit" disabled={creating} className={`${buttonClass} self-start`}>
          {creating ? 'Creando…' : 'Crear club'}
        </button>
      </form>

      <form onSubmit={handleJoin} className="bg-bg-elevated rounded-xl border border-border p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Unirme con código</h2>
        <input
          className={`${inputClass} uppercase tracking-widest`}
          placeholder="ABC123"
          maxLength={8}
          value={code}
          onChange={e => setCode(e.target.value)}
        />
        <button type="submit" disabled={joining} className={`${buttonClass} self-start`}>
          {joining ? 'Uniendo…' : 'Unirme'}
        </button>
      </form>
    </div>
  )
}
