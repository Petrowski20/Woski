'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createLeagueAction, joinLeagueAction } from '@/app/(main)/ligas/actions'

type Tab = 'create' | 'join'

export default function LeagueManager() {
  const [activeTab, setActiveTab] = useState<Tab>('create')

  // Estado formulario "Crear"
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating]   = useState(false)

  // Estado formulario "Unirse"
  const [code, setCode]       = useState('')
  const [isJoining, setIsJoining] = useState(false)

  // ── Crear ──────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }

    setIsCreating(true)
    const result = await createLeagueAction(name.trim(), description.trim())
    setIsCreating(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        `Liga creada. Comparte el código: ${result.join_code}`,
        { duration: 6000 }
      )
      setName('')
      setDescription('')
    }
  }

  // ── Unirse ─────────────────────────────────────────────────
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { toast.error('Introduce un código de liga'); return }

    setIsJoining(true)
    const result = await joinLeagueAction(trimmed)
    setIsJoining(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`¡Te has unido a "${result.leagueName}"!`)
      setCode('')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Pestañas */}
      <div className="flex border-b border-gray-100">
        {([ ['create', '➕ Crear Liga'], ['join', '🔗 Unirse con Código'] ] as [Tab, string][]).map(
          ([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      <div className="p-6">
        {/* ──── Formulario Crear ──── */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Los del Bar, Peñeta 2026…"
                maxLength={60}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción{' '}
                <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿De qué va esta liga?"
                rows={2}
                maxLength={200}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="mt-1 w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creando…' : 'Crear Liga'}
            </button>
          </form>
        )}

        {/* ──── Formulario Unirse ──── */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoin} className="flex flex-col items-center gap-5">
            <p className="text-sm text-gray-500 text-center">
              Pide el código de 6 caracteres al creador de la liga e introdúcelo aquí.
            </p>

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="X7K9PQ"
              maxLength={8}
              spellCheck={false}
              autoComplete="off"
              className="w-48 text-center text-3xl font-bold tracking-[0.3em] uppercase border-2 border-gray-200 rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:tracking-normal placeholder:text-gray-300 placeholder:text-2xl"
            />

            <button
              type="submit"
              disabled={isJoining}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isJoining ? 'Uniéndome…' : 'Unirse a la Liga'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
